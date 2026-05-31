export const GOTCHI_ROW_FRAME_COUNTS = [6, 7, 3, 6, 4, 7] as const;
export const GOTCHI_MAX_COLS = 7;
export type GotchiRow = 0 | 1 | 2 | 3 | 4 | 5;

export function getGotchiRowEndFrame(row: GotchiRow): number {
  const count = GOTCHI_ROW_FRAME_COUNTS[row];
  const safeCount = typeof count === 'number' ? count : 0;
  return Math.max(0, safeCount - 1);
}
