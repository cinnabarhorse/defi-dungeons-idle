import { TOKEN_DECIMALS } from './constants';
import type { TokenSymbol } from '../../types/topup';


export function formatAmount(amount: number, token: TokenSymbol): string {
  if (!Number.isFinite(amount)) {
    return '0';
  }

  const decimals = TOKEN_DECIMALS[token];
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(decimals, 6),
  });

  return formatter.format(amount);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return diffSeconds <= 0 ? 'just now' : `${diffSeconds} sec${diffSeconds === 1 ? '' : 's'} ago`;
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }

  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  // For older dates, show the actual date
  return formatDate(iso);
}

export function formatTxHash(hash: string | null | undefined): string {
  if (!hash) {
    return '—';
  }
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export function getExplorerTxUrl(hash: string, chainId?: number | null): string {
  const baseUrl =
    chainId === 84532 ? 'https://sepolia.basescan.org' : 'https://basescan.org';
  return `${baseUrl}/tx/${hash}`;
}
