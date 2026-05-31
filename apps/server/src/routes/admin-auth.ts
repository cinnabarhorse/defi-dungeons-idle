import type { Application, Request, Response } from 'express';
import { resolveSessionFromRequest } from '../lib/auth/session';
import { isAdminWalletAddress } from '../lib/auth/admin-allowlist';

export interface AdminSessionResult {
  address: string;
  playerId: string | null;
}

export function isAdminAddress(address: string | null | undefined): boolean {
  return isAdminWalletAddress(address);
}

export async function requireAdminSession(
  req: Request,
  res: Response
): Promise<AdminSessionResult | null> {
  const resolved = await resolveSessionFromRequest(req);
  if (!resolved) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  if (!isAdminAddress(resolved.address)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return {
    address: resolved.address,
    playerId: resolved.playerId,
  };
}
