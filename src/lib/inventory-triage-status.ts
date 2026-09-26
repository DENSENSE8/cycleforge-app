// Single source of truth for tracking-exception (inventory triage) status tones.

export type TriageExceptionStatus = 'open' | 'resolved' | 'discarded';

interface TriageStatusTone {
  label: string;
  /** Badge variant — no ring (workspace header pill). */
  badge: string;
  /** Chip variant — with ring (sidebar row pill). */
  chip: string;
}

const TRIAGE_STATUS_TONES: Record<TriageExceptionStatus, TriageStatusTone> = {
  open: {
    label: 'Open',
    badge: 'bg-amber-50 text-amber-700',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  resolved: {
    label: 'Resolved',
    badge: 'bg-emerald-50 text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  discarded: {
    label: 'Discarded',
    badge: 'bg-surface-sunken text-text-soft',
    chip: 'bg-surface-sunken text-text-soft ring-border-soft',
  },
};

const FALLBACK_BADGE = 'bg-surface-sunken text-text-soft';
const FALLBACK_CHIP = 'bg-surface-sunken text-text-soft ring-border-soft';

/** Badge classes (no ring) for a triage status; safe for unknown values. */
export function triageStatusBadgeClass(status: string): string {
  return TRIAGE_STATUS_TONES[status as TriageExceptionStatus]?.badge ?? FALLBACK_BADGE;
}

/** Chip classes (with ring) for a triage status; safe for unknown values. */
export function triageStatusChipClass(status: string): string {
  return TRIAGE_STATUS_TONES[status as TriageExceptionStatus]?.chip ?? FALLBACK_CHIP;
}

/** Human label for a triage status; falls back to the raw code. */
export function triageStatusLabel(status: string): string {
  return TRIAGE_STATUS_TONES[status as TriageExceptionStatus]?.label ?? status;
}
