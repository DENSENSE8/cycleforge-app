// Single source of truth for unit repair-history OUTCOME tones.

export type RepairOutcome = 'completed' | 'in_progress' | 'pending' | 'failed' | 'scrapped';

const TONES: Record<RepairOutcome, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  in_progress: 'bg-blue-50 text-blue-700',
  pending: 'bg-surface-sunken text-text-muted',
  failed: 'bg-rose-50 text-rose-700',
  scrapped: 'bg-rose-50 text-rose-700',
};

const FALLBACK = 'bg-surface-sunken text-text-muted';

/** Flat chip classes for a repair outcome; safe for unknown values. */
export function repairOutcomeToneClass(status: string): string {
  return TONES[status as RepairOutcome] ?? FALLBACK;
}
