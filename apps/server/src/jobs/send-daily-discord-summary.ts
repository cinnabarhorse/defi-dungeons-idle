/**
 * Daily Discord Summary Job
 *
 * This job runs after the daily reset (UTC 00:00) to send a Discord message
 * summarizing the previous day's activity:
 * - Number of runs completed
 * - Daily Active Users (DAU)
 * - Highest score and who achieved it
 *
 * Schedule: Run at UTC 00:10 daily via cron or external scheduler.
 */

import { statsRepo } from '../lib/db';

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_DAILY_SUMMARY_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1458369323147198484/AINpgdOmiiuJi6cUfwAZDj652NP_hKWFR7ss9E7elIJLzW7yr5AurnM0N_-UOH40vJAu';

// ────────────────────────────────────────────────────────────────────────────
// Discord Webhook
// ────────────────────────────────────────────────────────────────────────────

interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

async function sendDiscordMessage(embeds: DiscordEmbed[]): Promise<void> {
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Discord webhook failed: ${response.status} ${text}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Job
// ────────────────────────────────────────────────────────────────────────────

export interface DailySummaryJobResult {
  date: string;
  success: boolean;
  runsCompleted: number;
  dau: number;
  competitionRunsCompleted: number;
  competitionDau: number;
  highestScore: number | null;
  highestScorePlayer: string | null;
  discordSent: boolean;
  error?: string;
}

function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Run the daily summary job for a specific date.
 * If no date is provided, uses yesterday's date.
 */
export async function runDailySummaryJob(options?: {
  date?: string;
  skipDiscord?: boolean;
}): Promise<DailySummaryJobResult> {
  const targetDate = options?.date ?? getYesterdayDateString();

  const result: DailySummaryJobResult = {
    date: targetDate,
    success: false,
    runsCompleted: 0,
    dau: 0,
    competitionRunsCompleted: 0,
    competitionDau: 0,
    highestScore: null,
    highestScorePlayer: null,
    discordSent: false,
  };

  try {
    console.log(`[DailySummary] Fetching stats for ${targetDate}`);

    // Get the summary from the database
    const summary = await statsRepo.getDailySummary({ date: targetDate });

    result.runsCompleted = summary.runsCompleted;
    result.dau = summary.dau;
    result.competitionRunsCompleted = summary.competitionRunsCompleted;
    result.competitionDau = summary.competitionDau;
    result.highestScore = summary.highestScore;
    result.highestScorePlayer = summary.highestScorePlayerUsername;

    console.log(`[DailySummary] Stats for ${targetDate}:`, {
      runsCompleted: result.runsCompleted,
      dau: result.dau,
      competitionRunsCompleted: result.competitionRunsCompleted,
      competitionDau: result.competitionDau,
      highestScore: result.highestScore,
      highestScorePlayer: result.highestScorePlayer,
    });

    // Send Discord notification
    if (!options?.skipDiscord) {
      const embed: DiscordEmbed = {
        title: `📊 Daily Summary for ${targetDate}`,
        color: 0x7c3aed, // Purple color
        fields: [
          {
            name: '🎮 Runs Completed',
            value: formatNumber(result.runsCompleted),
            inline: true,
          },
          {
            name: '👥 Daily Active Users',
            value: formatNumber(result.dau),
            inline: true,
          },
          {
            name: '🏁 Competition Runs Completed',
            value: formatNumber(result.competitionRunsCompleted),
            inline: true,
          },
          {
            name: '🥇 Competition DAU',
            value: formatNumber(result.competitionDau),
            inline: true,
          },
          {
            name: '🏆 Highest Score',
            value: result.highestScore != null
              ? `${formatNumber(result.highestScore)} by **${result.highestScorePlayer ?? 'Unknown'}**`
              : 'No scores recorded',
            inline: false,
          },
        ],
        footer: {
          text: 'Gotchiverse Live',
        },
        timestamp: new Date().toISOString(),
      };

      await sendDiscordMessage([embed]);
      result.discordSent = true;
      console.log(`[DailySummary] Discord notification sent for ${targetDate}`);
    }

    result.success = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DailySummary] Job failed for ${targetDate}:`, error);
  }

  return result;
}

/**
 * CLI entry point for running the job manually.
 * Can be invoked via: npx tsx src/jobs/send-daily-discord-summary.ts [--skip-discord] [--date YYYY-MM-DD]
 */
async function main() {
  const args = process.argv.slice(2);
  const skipDiscord = args.includes('--skip-discord');
  const dateIndex = args.indexOf('--date');
  const date = dateIndex >= 0 && args[dateIndex + 1] ? args[dateIndex + 1] : undefined;

  console.log('Running daily Discord summary job', { skipDiscord, date });

  try {
    const result = await runDailySummaryJob({ skipDiscord, date });
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

