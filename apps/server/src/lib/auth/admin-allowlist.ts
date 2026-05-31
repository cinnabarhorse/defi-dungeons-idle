import { DEFAULT_ADMIN_ADDRESS } from '../constants';

const DEFAULT_ADMIN_ALLOWLIST = [DEFAULT_ADMIN_ADDRESS];

function parseAdminWalletAllowlist(raw: string | undefined): Set<string> {
  const normalized = raw
    ? raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ADMIN_ALLOWLIST.map((entry) => entry.toLowerCase());
  return new Set(normalized);
}

export function getAdminWalletAllowlist(): Set<string> {
  return parseAdminWalletAllowlist(process.env.ADMIN_WALLET_ALLOWLIST);
}

export function isAdminWalletAddress(
  address: string | null | undefined
): boolean {
  if (!address) {
    return false;
  }
  return getAdminWalletAllowlist().has(address.trim().toLowerCase());
}
