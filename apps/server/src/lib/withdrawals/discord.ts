import { ethers } from 'ethers';
import type { TokenWithdrawalRecord } from '../db';
import { getWithdrawalTokenConfig } from './token-config';

const DEFAULT_DISCORD_WITHDRAWALS_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1436343527146786878/aZk5mnB8NPM4vDpMtDBN3nuL3VlWzvG0F7jzEqRCRc--irTaKKg2x1R-EP1ZCI9pO5v-';
const DEFAULT_BASE_RPC_URL =
  process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ERC20_READ_ABI = ['function balanceOf(address owner) view returns (uint256)'];

let balanceProvider: ethers.JsonRpcProvider | null = null;

type WithdrawalDiscordRecord = Pick<
  TokenWithdrawalRecord,
  | 'id'
  | 'playerId'
  | 'currency'
  | 'amount'
  | 'amountBaseUnits'
  | 'source'
  | 'chainId'
  | 'txHash'
>;

function getWithdrawalsWebhookUrl(): string {
  return (
    process.env.DISCORD_WITHDRAWALS_WEBHOOK_URL ||
    DEFAULT_DISCORD_WITHDRAWALS_WEBHOOK_URL
  );
}

function truncate(value: string, maxLength = 300): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatWithdrawalAmount(withdrawal: WithdrawalDiscordRecord): string {
  const currency = (withdrawal.currency || 'USDC').toUpperCase();

  if (typeof withdrawal.amount === 'string' && withdrawal.amount.trim().length) {
    return withdrawal.amount.trim();
  }

  const decimals = currency === 'GHST' ? 18 : 6;
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = withdrawal.amountBaseUnits / divisor;
  const fraction = withdrawal.amountBaseUnits % divisor;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionDisplay = fraction
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return `${whole.toString()}.${fractionDisplay}`;
}

function formatBalanceRemaining(raw: bigint, decimals: number): string {
  const formatted = ethers.formatUnits(raw, decimals);
  const [wholePart, fractionPart = ''] = formatted.split('.');
  const wholeWithCommas = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmedFraction = fractionPart.replace(/0+$/, '');
  return trimmedFraction.length
    ? `${wholeWithCommas}.${trimmedFraction}`
    : wholeWithCommas;
}

function getBalanceProvider(): ethers.JsonRpcProvider {
  if (!balanceProvider) {
    balanceProvider = new ethers.JsonRpcProvider(DEFAULT_BASE_RPC_URL);
  }
  return balanceProvider;
}

async function getTokenBalanceRemaining(
  currency: string | null | undefined
): Promise<string | null> {
  const walletAddress = process.env.THIRDWEB_SERVER_WALLET?.trim();
  if (!walletAddress) {
    return null;
  }

  try {
    const tokenConfig = getWithdrawalTokenConfig(currency);
    const provider = getBalanceProvider();
    const token = new ethers.Contract(
      tokenConfig.tokenAddress,
      ERC20_READ_ABI,
      provider
    );
    const rawBalance = (await token.balanceOf(walletAddress)) as bigint;
    return formatBalanceRemaining(rawBalance, tokenConfig.decimals);
  } catch {
    return null;
  }
}

async function postDiscordMessage(content: string): Promise<void> {
  const webhookUrl = getWithdrawalsWebhookUrl();
  if (!webhookUrl) {
    return;
  }
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

export async function notifyWithdrawalSuccess(input: {
  withdrawal: WithdrawalDiscordRecord;
  toWallet: string;
  txHash: string;
}): Promise<void> {
  const amount = formatWithdrawalAmount(input.withdrawal);
  const currency = (input.withdrawal.currency || 'USDC').toUpperCase();
  const balanceRemaining = await getTokenBalanceRemaining(currency);
  const content = [
    '**🎉 New withdrawal processed!**',
    '',
    `${amount} ${currency} was sent to ${input.toWallet}.`,
    `${currency} Balance Remaining: ${balanceRemaining ?? 'unknown'}`,
    '',
    `withdrawal_id: ${input.withdrawal.id}`,
    `txid: ${input.txHash}`,
  ].join('\n');
  await postDiscordMessage(content);
}

export async function notifyWithdrawalFailure(input: {
  withdrawal: WithdrawalDiscordRecord;
  failureReason: string;
  toWallet?: string | null;
  txHash?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const amount = formatWithdrawalAmount(input.withdrawal);
  const currency = (input.withdrawal.currency || 'USDC').toUpperCase();
  const lines = [
    '**🚨 Withdrawal failed**',
    '',
    `withdrawal_id: ${input.withdrawal.id}`,
    `player_id: ${input.withdrawal.playerId}`,
    `amount: ${amount} ${currency}`,
    `source: ${input.withdrawal.source || 'unknown'}`,
    `chain_id: ${
      input.withdrawal.chainId == null ? 'unknown' : input.withdrawal.chainId
    }`,
    `wallet: ${input.toWallet || 'unknown'}`,
    `reason: ${truncate(input.failureReason, 180)}`,
  ];

  const txHash = input.txHash || input.withdrawal.txHash;
  if (txHash) {
    lines.push(`txid: ${txHash}`);
  }

  if (input.errorMessage) {
    lines.push(`error: ${truncate(input.errorMessage, 500)}`);
  }

  await postDiscordMessage(lines.join('\n'));
}
