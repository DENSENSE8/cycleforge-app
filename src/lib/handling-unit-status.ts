// Single source of truth for handling-unit (H-####) box status tones.

type HandlingUnitStatus = 'OPEN' | 'STAGED' | 'IN_TEST' | 'CLOSED';

const TONES: Record<HandlingUnitStatus, string> = {
  OPEN: 'bg-surface-sunken text-text-muted',
  STAGED: 'bg-amber-100 text-amber-800',
  IN_TEST: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-emerald-100 text-emerald-700',
};

const FALLBACK = 'bg-surface-sunken text-text-muted';

/** Flat chip classes for a handling-unit box status; safe for unknown values. */
export function handlingUnitStatusChipClass(status: string): string {
  return TONES[status as HandlingUnitStatus] ?? FALLBACK;
}
