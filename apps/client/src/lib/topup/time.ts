const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const next = new Date(date.getTime() + days * MS_PER_DAY);
  return next.toISOString();
}

export function daysUntil(iso: string | null | undefined): number {
  if (!iso) {
    return 0;
  }
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) {
    return 0;
  }

  const diff = target.getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / MS_PER_DAY) : 0;
}
