// Single source of truth for mobile PO-detail header status tones.

export type PoHeaderStatus = 'OPEN' | 'RECEIVED';

const TONES: Record<PoHeaderStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  RECEIVED: 'bg-emerald-100 text-emerald-700',
};

const FALLBACK = 'bg-surface-sunken text-text-muted';

/** Flat chip classes for a PO header status; safe for unknown values. */
export function poHeaderStatusChipClass(status: string): string {
  return TONES[status as PoHeaderStatus] ?? FALLBACK;
}
