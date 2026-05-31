export const TOPUP_ROUTE = '/me/topup';

export function openTopup(target: string = '_blank'): void {
  if (typeof window === 'undefined') return;
  window.open(TOPUP_ROUTE, target);
}
