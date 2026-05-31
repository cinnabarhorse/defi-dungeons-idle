/**
 * Daily Quest Competition Prize Distribution Job
 *
 * This job runs after the daily reset (UTC 00:00) to distribute prizes
 * to the top 10 players in each difficulty tier from the previous day.
 *
 * Prizes are credited to the player's in-game balance via the existing
 * TokenWithdrawal system, which allows them to claim at `/me/tokens/`.
 *
 * Schedule: Run at UTC 00:05 daily via cron or external scheduler.
 */

import {
  dailyQuestLeaderboardRepo,
  tokenWithdrawalsRepo,
  runTransaction,
  playersRepo,
  depositsRepo,
} from '../lib/db';
import {
  getDailyQuestCompetitionConfig,
  getCompetitionDate,
  getPositionPrize,
  COMPETITION_TIERS,
  type CompetitionTier,
} from '../lib/daily-quest-competition';

// ────────────────────────────────────────────────────────────────────────────
// Discord Webhook Configuration
// ────────────────────────────────────────────────────────────────────────────

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_DAILY_REWARDS_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1460528952945672284/jUJX0oAH0VaX5z7cQDt9e7729Xvk4ZScsY8NoPjImgRgitgRO_aGfl00QzG1kHgrwO5L';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

// NOTE (Issue #219): Rewards are split by staked currency.
// - USDC rewards require USDC/GHO stake >= threshold for the difficulty tier.
// - GHST rewards require GHST stake >= threshold for the difficulty tier.
// Thresholds (per currency): normal=1, nightmare=100, hell=1000.
const MIN_USDC_STAKE_BY_TIER: Record<CompetitionTier, number> = {
  normal: 1,
  nightmare: 100,
  hell: 1000,
};

const MIN_GHST_STAKE_BY_TIER: Record<CompetitionTier, number> = {
  normal: 1,
  nightmare: 100,
  hell: 1000,
};

async function getRewardEligibility(input: {
  accountId: string;
  tier: CompetitionTier;
}): Promise<{ eligibleUsdc: boolean; eligibleGhst: boolean }> {
  const usdcThreshold = MIN_USDC_STAKE_BY_TIER[input.tier] ?? 0;
  const ghstThreshold = MIN_GHST_STAKE_BY_TIER[input.tier] ?? 0;

  const balances = await depositsRepo.getStakedTokenBalances(input.accountId, [
    'USDC',
    'GHO',
    'GHST',
  ]);

  const usdcStaked = (balances['USDC'] ?? 0) + (balances['GHO'] ?? 0);
  const ghstStaked = balances['GHST'] ?? 0;
  const hasUsdcStake = usdcStaked > 0;
  const hasGhstStake = ghstStaked > 0;

  return {
    eligibleUsdc: hasUsdcStake && usdcStaked >= usdcThreshold,
    eligibleGhst: hasGhstStake && ghstStaked >= ghstThreshold,
  };
}

// Convert USDC amount to base units (6 decimals)
function usdcToBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

// Convert GHST amount to base units (18 decimals)
function ghstToBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1e18));
}

export interface PrizeDistributionResult {
  date: string;
  tier: CompetitionTier;
  position: number;
  accountId: string;
  username: string | null;
  finalScore: number;

  /**
   * Amounts actually paid out (after staking-currency eligibility rules).
   */
  usdcAmount: number;
  ghstAmount: number;

  /**
   * Debug/audit: amounts that would have been paid if the player was eligible.
   */
  prizeUsdcAmount: number;
  prizeGhstAmount: number;

  usdcWithdrawalId: string | null;
  ghstWithdrawalId: string | null;
  success: boolean;
  error?: string;
}

export interface DistributionJobResult {
  date: string;
  success: boolean;
  tiersProcessed: number;
  prizesDistributed: number;
  prizesSkipped: number;
  prizesFailed: number;
  totalUsdcDistributed: number;
  totalGhstDistributed: number;
  results: PrizeDistributionResult[];
  errors: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Discord Notification
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format a number with appropriate decimal places for display.
 */
function formatAmount(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.01) return amount.toFixed(4);
  return amount.toFixed(2);
}

/**
 * Get display name for an account - uses username if available, otherwise truncated address.
 */
async function getDisplayName(accountId: string): Promise<string> {
  try {
    const player = await playersRepo.getPlayerById(accountId);
    if (player?.username) {
      return player.username;
    }
  } catch {
    // Ignore errors, fall back to address
  }
  // Truncate address: 0x1234...abcd
  if (accountId.startsWith('0x') && accountId.length > 12) {
    return `${accountId.slice(0, 6)}...${accountId.slice(-4)}`;
  }
  return accountId;
}

/**
 * Format tier name for display (capitalize first letter).
 */
function formatTierName(tier: CompetitionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Send a Discord notification with the prize distribution results.
 */
export async function sendPrizeDistributionDiscordNotification(
  result: DistributionJobResult
): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[Discord] No webhook URL configured, skipping notification');
    return false;
  }

  if (result.prizesDistributed === 0) {
    console.log('[Discord] No prizes distributed, skipping notification');
    return false;
  }

  try {
    // Group results by tier
    const resultsByTier = new Map<CompetitionTier, PrizeDistributionResult[]>();
    for (const tier of COMPETITION_TIERS) {
      resultsByTier.set(tier, []);
    }
    for (const r of result.results) {
      if (r.success) {
        resultsByTier.get(r.tier)?.push(r);
      }
    }

    // Build message sections for each tier
    const tierSections: string[] = [];

    for (const tier of COMPETITION_TIERS) {
      const tierResults = resultsByTier.get(tier) ?? [];
      if (tierResults.length === 0) continue;

      // Sort by position
      tierResults.sort((a, b) => a.position - b.position);

      // Get display names for all players in this tier
      const lines: string[] = [];
      for (const r of tierResults) {
        const displayName = await getDisplayName(r.accountId);
        const ghstStr = formatAmount(r.ghstAmount);
        const usdcStr = formatAmount(r.usdcAmount);
        lines.push(
          `${r.position}. **${displayName}**: ${ghstStr} GHST, ${usdcStr} USDC`
        );
      }

      tierSections.push(`### ${formatTierName(tier)}:\n${lines.join('\n')}`);
    }

    // Build the full message
    const message = [
      '# 🏆 Daily Leaderboard Rewards have been sent!',
      '',
      `**Competition Date:** ${result.date}`,
      `**Total Distributed:** ${formatAmount(result.totalGhstDistributed)} GHST, ${formatAmount(result.totalUsdcDistributed)} USDC`,
      '',
      "## Today's Winners:",
      ...tierSections,
    ].join('\n');

    // Send to Discord
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`Discord webhook failed: ${response.status} ${text}`);
    }

    console.log('[Discord] Prize distribution notification sent successfully');
    return true;
  } catch (error) {
    console.error(
      '[Discord] Failed to send prize distribution notification:',
      error
    );
    return false;
  }
}

/**
 * Distribute prizes for a specific tier on a given date.
 */
async function distributeTierPrizes(
  date: string,
  tier: CompetitionTier
): Promise<PrizeDistributionResult[]> {
  const config = getDailyQuestCompetitionConfig();
  const results: PrizeDistributionResult[] = [];

  // Get top N entries for this tier
  const topEntries = await dailyQuestLeaderboardRepo.getTopEntries(
    date,
    tier,
    config.topPositions
  );

  if (topEntries.length === 0) {
    console.log(
      `No entries for ${tier} on ${date}, skipping prize distribution`
    );
    return results;
  }

  console.log(
    `Distributing prizes for ${tier} on ${date}: ${topEntries.length} winners`
  );

  // Batch fetch usernames for all entries
  const usernameMap = new Map<string, string | null>();
  for (const entry of topEntries) {
    try {
      const player = await playersRepo.getPlayerById(entry.accountId);
      usernameMap.set(entry.accountId, player?.username ?? null);
    } catch {
      usernameMap.set(entry.accountId, null);
    }
  }

  for (let i = 0; i < topEntries.length; i++) {
    const entry = topEntries[i];
    const position = i + 1;
    const prize = getPositionPrize(tier, position);

    const result: PrizeDistributionResult = {
      date,
      tier,
      position,
      accountId: entry.accountId,
      username: usernameMap.get(entry.accountId) ?? null,
      finalScore: entry.finalScore,

      // These get overwritten once we compute eligibility.
      usdcAmount: 0,
      ghstAmount: 0,
      prizeUsdcAmount: prize.usdc,
      prizeGhstAmount: prize.ghst,

      usdcWithdrawalId: null,
      ghstWithdrawalId: null,
      success: false,
    };

    try {
      const eligibility = await getRewardEligibility({
        accountId: entry.accountId,
        tier,
      });

      // Apply split-by-staked-currency rule.
      const payoutUsdc = eligibility.eligibleUsdc ? prize.usdc : 0;
      const payoutGhst = eligibility.eligibleGhst ? prize.ghst : 0;

      result.usdcAmount = payoutUsdc;
      result.ghstAmount = payoutGhst;

      const distributionResult = await runTransaction(async (client) => {
        const prizeRecord =
          await dailyQuestLeaderboardRepo.createPrizeDistribution({
            competitionDate: date,
            difficultyId: tier,
            accountId: entry.accountId,
            leaderboardEntryId: entry.id,
            position,
            finalScore: entry.finalScore,
            usdcAmount: payoutUsdc,
            ghstAmount: payoutGhst,
            client,
          });

        const lockedPrize =
          await dailyQuestLeaderboardRepo.getPrizeDistributionForUpdate({
            competitionDate: date,
            difficultyId: tier,
            position,
            client,
          });

        if (!lockedPrize) {
          throw new Error('Failed to lock prize distribution row');
        }

        const existingUsdcWithdrawalId = lockedPrize.usdcWithdrawalId ?? null;
        const existingGhstWithdrawalId = lockedPrize.ghstWithdrawalId ?? null;

        const shouldSendUsdc =
          payoutUsdc > 0 && !existingUsdcWithdrawalId;
        const shouldSendGhst =
          payoutGhst > 0 && !existingGhstWithdrawalId;

        if (!shouldSendUsdc && !shouldSendGhst) {
          const hasExistingWithdrawal = Boolean(
            existingUsdcWithdrawalId || existingGhstWithdrawalId
          );
          const skipReason =
            hasExistingWithdrawal ? 'already_distributed' : 'not_eligible';
          return {
            status: 'skipped' as const,
            prizeRecord: lockedPrize,
            skipReason,
          };
        }

        result.usdcWithdrawalId = existingUsdcWithdrawalId;
        result.ghstWithdrawalId = existingGhstWithdrawalId;

        // USDC withdrawal (only if eligible + payout > 0)
        if (shouldSendUsdc) {
          const usdcWithdrawal =
            await tokenWithdrawalsRepo.createTokenWithdrawal({
              playerId: entry.accountId,
              currency: 'USDC',
              amount: payoutUsdc.toFixed(6),
              amountBaseUnits: usdcToBaseUnits(payoutUsdc),
              source: `daily_quest_prize_${tier}_${position}`,
              metadata: {
                competitionDate: date,
                tier,
                position,
                finalScore: entry.finalScore,
                prizeDistributionId: prizeRecord.id,
              },
              client,
            });
          result.usdcWithdrawalId = usdcWithdrawal.id;
        }

        // GHST withdrawal (only if eligible + payout > 0)
        if (shouldSendGhst) {
          const ghstWithdrawal =
            await tokenWithdrawalsRepo.createTokenWithdrawal({
              playerId: entry.accountId,
              currency: 'GHST',
              amount: payoutGhst.toFixed(6),
              amountBaseUnits: ghstToBaseUnits(payoutGhst),
              source: `daily_quest_prize_${tier}_${position}`,
              metadata: {
                competitionDate: date,
                tier,
                position,
                finalScore: entry.finalScore,
                prizeDistributionId: prizeRecord.id,
              },
              client,
            });
          result.ghstWithdrawalId = ghstWithdrawal.id;
        }

        // Mark prize as distributed
        const updatedPrize = await dailyQuestLeaderboardRepo.markPrizeDistributed(
          prizeRecord.id,
          result.usdcWithdrawalId,
          result.ghstWithdrawalId,
          client
        );

        return {
          status: 'distributed' as const,
          prizeRecord: updatedPrize ?? prizeRecord,
        };
      });

      if (distributionResult.status === 'skipped') {
        result.error =
          distributionResult.skipReason === 'not_eligible'
            ? 'Not staked for rewards'
            : 'Already distributed';
        console.log(`Skipped prize for ${tier} #${position} on ${date}`, {
          accountId: entry.accountId,
        });
      } else {
        result.success = true;
        console.log(
          `Distributed prize for ${tier} #${position} to ${entry.accountId}`,
          {
            usdc: payoutUsdc,
            ghst: payoutGhst,
            score: entry.finalScore,
          }
        );
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to distribute prize for ${tier} #${position}`, {
        accountId: entry.accountId,
        error,
      });
    }

    results.push(result);
  }

  return results;
}

/**
 * Run the full prize distribution job for a specific date.
 * If no date is provided, uses yesterday's date (the competition that just ended).
 */
export async function runPrizeDistributionJob(options?: {
  date?: string;
  dryRun?: boolean;
  allowAlreadyDistributed?: boolean;
}): Promise<DistributionJobResult> {
  const config = getDailyQuestCompetitionConfig();
  const allowAlreadyDistributed = options?.allowAlreadyDistributed === true;

  // Default to yesterday (the competition that just ended at midnight)
  const targetDate = options?.date ?? getCompetitionDate({ offsetDays: -1 });

  const jobResult: DistributionJobResult = {
    date: targetDate,
    success: false,
    tiersProcessed: 0,
    prizesDistributed: 0,
    prizesSkipped: 0,
    prizesFailed: 0,
    totalUsdcDistributed: 0,
    totalGhstDistributed: 0,
    results: [],
    errors: [],
  };

  if (!config.enabled) {
    jobResult.errors.push('Daily quest competition is disabled');
    return jobResult;
  }

  // Check if prizes have already been distributed for this date
  const alreadyDistributed =
    await dailyQuestLeaderboardRepo.hasDistributedPrizesForDate(targetDate);

  if (alreadyDistributed && !allowAlreadyDistributed) {
    jobResult.errors.push(`Prizes already distributed for ${targetDate}`);
    return jobResult;
  }

  console.log(`Starting prize distribution for ${targetDate}`, {
    dryRun: options?.dryRun ?? false,
  });

  if (options?.dryRun) {
    // Dry run: calculate what would be distributed (stake-aware).
    const existingPrizeRows = allowAlreadyDistributed
      ? await dailyQuestLeaderboardRepo.getPrizeDistributionsForDate(targetDate)
      : [];
    const existingPrizeMap = new Map(
      existingPrizeRows.map((row) => [
        `${row.difficultyId}:${row.position}`,
        row,
      ])
    );

    for (const tier of COMPETITION_TIERS) {
      const topEntries = await dailyQuestLeaderboardRepo.getTopEntries(
        targetDate,
        tier,
        config.topPositions
      );

      // Batch fetch usernames for dry run
      const usernameMap = new Map<string, string | null>();
      for (const entry of topEntries) {
        try {
          const player = await playersRepo.getPlayerById(entry.accountId);
          usernameMap.set(entry.accountId, player?.username ?? null);
        } catch {
          usernameMap.set(entry.accountId, null);
        }
      }

      for (let i = 0; i < topEntries.length; i++) {
        const entry = topEntries[i];
        const position = i + 1;
        const prize = getPositionPrize(tier, position);
        const eligibility = await getRewardEligibility({
          accountId: entry.accountId,
          tier,
        });
        const payoutUsdc = eligibility.eligibleUsdc ? prize.usdc : 0;
        const payoutGhst = eligibility.eligibleGhst ? prize.ghst : 0;
        const existingPrize = existingPrizeMap.get(`${tier}:${position}`);
        const existingUsdcWithdrawalId =
          existingPrize?.usdcWithdrawalId ?? null;
        const existingGhstWithdrawalId =
          existingPrize?.ghstWithdrawalId ?? null;
        const shouldSendUsdc =
          payoutUsdc > 0 && !existingUsdcWithdrawalId;
        const shouldSendGhst =
          payoutGhst > 0 && !existingGhstWithdrawalId;
        const usdcAmount = shouldSendUsdc ? payoutUsdc : 0;
        const ghstAmount = shouldSendGhst ? payoutGhst : 0;
        const hasAnyPayout = usdcAmount > 0 || ghstAmount > 0;
        const hasAnyPrize = payoutUsdc > 0 || payoutGhst > 0;
        const error = hasAnyPayout
          ? undefined
          : hasAnyPrize
            ? 'Already distributed'
            : 'Not staked for rewards';

        jobResult.results.push({
          date: targetDate,
          tier,
          position,
          accountId: entry.accountId,
          username: usernameMap.get(entry.accountId) ?? null,
          finalScore: entry.finalScore,

          // Payout amounts reflect staking eligibility and already-paid prizes.
          usdcAmount,
          ghstAmount,
          prizeUsdcAmount: prize.usdc,
          prizeGhstAmount: prize.ghst,

          usdcWithdrawalId: null,
          ghstWithdrawalId: null,
          success: hasAnyPayout,
          error,
        });

        if (hasAnyPayout) {
          jobResult.totalUsdcDistributed += usdcAmount;
          jobResult.totalGhstDistributed += ghstAmount;
          jobResult.prizesDistributed++;
        } else {
          jobResult.prizesSkipped++;
        }
      }

      jobResult.tiersProcessed++;
    }

    jobResult.success = true;
    return jobResult;
  }

  // Actual distribution
  for (const tier of COMPETITION_TIERS) {
    try {
      const tierResults = await distributeTierPrizes(targetDate, tier);
      jobResult.results.push(...tierResults);

      for (const result of tierResults) {
        if (result.success) {
          jobResult.prizesDistributed++;
          jobResult.totalUsdcDistributed += result.usdcAmount;
          jobResult.totalGhstDistributed += result.ghstAmount;
        } else if (
          result.error === 'Already distributed' ||
          result.error === 'Not staked for rewards'
        ) {
          jobResult.prizesSkipped++;
          if (result.error === 'Not staked for rewards') {
            // Not an error condition; informational for audit.
          }
        } else {
          jobResult.prizesFailed++;
          if (result.error) {
            jobResult.errors.push(`${tier} #${result.position}: ${result.error}`);
          }
        }
      }

      jobResult.tiersProcessed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      jobResult.errors.push(`Failed to process tier ${tier}: ${message}`);
      console.error(`Failed to process tier ${tier}`, { error });
    }
  }

  jobResult.success =
    jobResult.errors.length === 0 && jobResult.prizesFailed === 0;

  console.log(`Prize distribution completed for ${targetDate}`, {
    success: jobResult.success,
    prizesDistributed: jobResult.prizesDistributed,
    prizesFailed: jobResult.prizesFailed,
    totalUsdc: jobResult.totalUsdcDistributed,
    totalGhst: jobResult.totalGhstDistributed,
  });

  return jobResult;
}

/**
 * CLI entry point for running the job manually.
 * Can be invoked via: npx tsx src/jobs/distribute-daily-quest-prizes.ts [--dry-run] [--date YYYY-MM-DD]
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateIndex = args.indexOf('--date');
  const date =
    dateIndex >= 0 && args[dateIndex + 1] ? args[dateIndex + 1] : undefined;

  console.log('Running daily quest prize distribution job', { dryRun, date });

  try {
    const result = await runPrizeDistributionJob({ dryRun, date });
    console.log('Job result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
