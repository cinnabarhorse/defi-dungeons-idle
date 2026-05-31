export type HandSlot = 'handLeft' | 'handRight';

/**
 * Resolve the preferred active hand-weapon index with stable semantics:
 * 1) Respect a valid previous index when in-bounds
 * 2) Prefer the left hand if present
 * 3) Fallback to 0
 */
export function resolvePreferredHandWeaponIndex(
  previousIndex: unknown,
  weapons: Array<{ slot: HandSlot }>
): number {
  if (!Array.isArray(weapons) || weapons.length === 0) {
    return -1;
  }

  const previous =
    typeof previousIndex === 'number' ? Math.floor(previousIndex) : -1;
  if (previous >= 0 && previous < weapons.length) {
    return previous;
  }

  const leftIndex = weapons.findIndex((entry) => entry.slot === 'handLeft');
  if (leftIndex >= 0) {
    return leftIndex;
  }

  return 0;
}
