// Single source of truth for system sync-run status tones.

type SyncRunStatus = 'success' | 'failed' | 'running';

const TONES: Record<SyncRunStatus, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  running: 'bg-blue-50 text-blue-700',
};

const FALLBACK = 'bg-surface-sunken text-text-muted';

/** Flat chip classes for a sync-run status; safe for unknown values. */
export function syncRunStatusChipClass(status: string): string {
  return TONES[status as SyncRunStatus] ?? FALLBACK;
}
