import { gamePlayersRepo } from '../lib/db';

/**
 * Record an entry fee charge for a player. Room must have entryFeeLedger Map.
 */
export function trackEntryFeeCharge(
  room: { entryFeeLedger: Map<string, { amountCents: number; chargedAtIso: string | null; refundable: boolean }> },
  playerId: string,
  amountCents: number,
  chargedAtIso: string | null,
  refundable: boolean
): void {
  if (!playerId || !Number.isFinite(amountCents) || amountCents <= 0) {
    return;
  }

  room.entryFeeLedger.set(playerId, {
    amountCents: Math.floor(amountCents),
    chargedAtIso,
    refundable,
  });
}

/**
 * Mark all ledger entries as non-refundable (e.g. when run starts).
 */
export function markEntryFeesNonRefundable(
  room: { entryFeeLedger: Map<string, { amountCents: number; chargedAtIso: string | null; refundable: boolean }> }
): void {
  room.entryFeeLedger.forEach((entry, playerId) => {
    if (entry.refundable) {
      room.entryFeeLedger.set(playerId, {
        ...entry,
        refundable: false,
      });
    }
  });
}

/**
 * Refund a player's entry fee and record metadata. Returns true if a refund was applied.
 */
export async function refundEntryFee(
  room: {
    entryFeeLedger: Map<string, { amountCents: number; chargedAtIso: string | null; refundable: boolean }>;
    currentGameId: string | null;
  },
  playerId: string,
  reason: 'timeout' | 'manual' | 'disconnect',
  extraMetadata: Record<string, unknown> = {}
): Promise<boolean> {
  const ledgerEntry = room.entryFeeLedger.get(playerId);
  if (!ledgerEntry || !ledgerEntry.refundable || ledgerEntry.amountCents <= 0) {
    return false;
  }

  room.entryFeeLedger.set(playerId, {
    amountCents: 0,
    chargedAtIso: ledgerEntry.chargedAtIso,
    refundable: false,
  });
  room.entryFeeLedger.delete(playerId);

  if (room.currentGameId) {
    try {
      const record = await gamePlayersRepo.getByGameAndPlayer(
        room.currentGameId,
        playerId
      );
      if (record) {
        await gamePlayersRepo.applyStats({
          gamePlayerId: record.id,
          metadata: {
            entryFeeRefunded: true,
            entryFeeRefundedAt: new Date().toISOString(),
            entryFeeRefundReason: reason,
            ...extraMetadata,
          },
        });
      }
    } catch (error) {
      console.error('Failed to record entry fee refund metadata', {
        playerId,
        reason,
        error,
      });
    }
  }

  return true;
}

