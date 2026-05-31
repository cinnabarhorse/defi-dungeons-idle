/**
 * Compatibility shim.
 *
 * The codebase historically had a staging-room flow. If you removed staging,
 * `GameRoom` may still import these helpers.
 *
 * This file keeps the server booting without reintroducing staging behavior.
 * Entry-fee helpers are delegated to `EntryFee.ts`; staging-only helpers are no-ops.
 */

import {
  trackEntryFeeCharge,
  markEntryFeesNonRefundable,
  refundEntryFee,
} from './EntryFee';

export { trackEntryFeeCharge, markEntryFeesNonRefundable, refundEntryFee };

export function initializeStagingEnvironment(_room: unknown, _countdownMs: number): void {
  // Staging removed: no-op.
}

export function scheduleStagingAutoClose(_room: unknown, _deadlineMs: number): void {
  // Staging removed: no-op.
}

export function clearStagingAutoCloseTimer(_room: unknown): void {
  // Staging removed: no-op.
}

export function scheduleLateJoinCutoff(_room: unknown, _deadlineMs: number): void {
  // Staging removed: no-op.
}

export function clearLateJoinTimer(_room: unknown): void {
  // Staging removed: no-op.
}

