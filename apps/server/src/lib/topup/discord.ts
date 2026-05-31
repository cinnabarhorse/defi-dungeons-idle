import { playersRepo } from '../db';

export interface StakedBalances {
  usdc: number;
  gho: number;
  ghst?: number;
}

const DEFAULT_DISCORD_USDC_TOPUP_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1464924643289989134/kWbM2XGVTUZEBUv_xzbvbe3yS27pETRS8xSsdO2oQIS1lgpzZv0YJnJPZ_zj4NPpEmKj';

type DiscordTopupTokenSymbol = 'USDC' | 'GHO' | 'GHST';

function normalizeDiscordTopupTokenSymbol(
  symbol: string | null | undefined
): DiscordTopupTokenSymbol {
  const upper = symbol?.toUpperCase();
  if (upper === 'GHO') return 'GHO';
  if (upper === 'GHST') return 'GHST';
  return 'USDC';
}

function formatTokenAmount(value: number | string): string {
  const trimmed = String(value).trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return trimmed;
  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function getUsdcTopupWebhookUrl(): string {
  return (
    process.env.DISCORD_USDC_TOPUP_WEBHOOK_URL ||
    DEFAULT_DISCORD_USDC_TOPUP_WEBHOOK_URL
  );
}

async function resolveDepositUsername(input: {
  userId?: string | null;
  depositorAddress?: string | null;
}): Promise<string | null> {
  const { userId, depositorAddress } = input;
  try {
    if (userId) {
      const player = await playersRepo.getPlayerById(userId);
      if (player?.username) return player.username;
    }
    if (depositorAddress) {
      const player = await playersRepo.getPlayerByWallet(depositorAddress);
      if (player?.username) return player.username;
    }
  } catch (error) {
    console.error('Failed to resolve deposit username', error);
  }
  return null;
}

async function sendUsdcTopupDiscordMessage(input: {
  username: string;
  amount: string;
  tokenSymbol: DiscordTopupTokenSymbol;
  stakedBalances?: StakedBalances;
}): Promise<void> {
  const webhookUrl = getUsdcTopupWebhookUrl();
  if (!webhookUrl) return;
  const totalStaked = input.stakedBalances
    ? ` | Total Staked: ${formatTokenAmount(
        input.stakedBalances.usdc
      )} USDC, ${formatTokenAmount(
        input.stakedBalances.gho
      )} GHO, ${formatTokenAmount(input.stakedBalances.ghst ?? 0)} GHST`
    : ' | Total Staked: unavailable';
  const content = `**${input.username}** deposited **${input.amount} ${input.tokenSymbol}**${totalStaked}`;
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => 'Discord request failed');
    throw new Error(`Discord webhook failed: ${response.status} ${text}`);
  }
}

export async function notifyUsdcTopupFromDeposit(input: {
  userId?: string | null;
  depositorAddress?: string | null;
  amount: string;
  tokenSymbol?: string | null;
  stakedBalances?: StakedBalances;
}): Promise<void> {
  const username =
    (await resolveDepositUsername({
      userId: input.userId,
      depositorAddress: input.depositorAddress,
    })) ?? 'Unknown user';
  const amount = formatTokenAmount(input.amount);
  const normalizedTokenSymbol = normalizeDiscordTopupTokenSymbol(
    input.tokenSymbol
  );
  await sendUsdcTopupDiscordMessage({
    username,
    amount,
    tokenSymbol: normalizedTokenSymbol,
    stakedBalances: input.stakedBalances,
  });
}
