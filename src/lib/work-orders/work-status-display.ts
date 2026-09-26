/** `WorkStatus` → label · tone · dot — the presentation SoT for a work-order's lifecycle state (Presentation kinds). */

import type { WorkStatus } from '@/components/work-orders/types';

const LABEL: Record<WorkStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'Active',
  DONE: 'Done',
  CANCELED: 'Canceled',
};

/** Chip trio (fill · ink · ring) — semantic families only, never a raw hex. */
const CHIP: Record<WorkStatus, string> = {
  OPEN: 'bg-surface-sunken text-text-muted ring-border-soft',
  ASSIGNED: 'bg-blue-50 text-blue-700 ring-blue-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-amber-200',
  DONE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELED: 'bg-surface-sunken text-text-faint ring-border-soft',
};

function coerce(status: string | null | undefined): WorkStatus | null {
  return status && status in LABEL ? (status as WorkStatus) : null;
}

/** Leading dot (`bg-*` only — the fill IS the dot). */
const DOT: Record<WorkStatus, string> = {
  OPEN: 'bg-surface-strong',
  ASSIGNED: 'bg-blue-500',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
  CANCELED: 'bg-surface-strong',
};

export function workStatusLabel(status: string | null | undefined): string | null {
  const s = coerce(status);
  return s ? LABEL[s] : null;
}

export function workStatusChipClass(status: string | null | undefined): string {
  const s = coerce(status);
  return s ? CHIP[s] : CHIP.OPEN;
}

/** Leading dot class for {@link GridStatusCellValue}'s `dotClass`. */
export function workStatusDot(status: string | null | undefined): string {
  const s = coerce(status);
  return s ? DOT[s] : DOT.OPEN;
}
