/**
 * `WorkStatus` → label · tone · dot — the presentation SoT for a work-order's
 * lifecycle state (`.claude/rules/source-of-truth.md` → Presentation kinds).
 *
 * There was no SoT for this, so the one surface that rendered it invented a map
 * inline: the My Day context pane painted `row.status.replace('_', ' ')` into a
 * hardcoded blue chip, which meant CANCELED and IN_PROGRESS read identically.
 * Views resolve through here now — same shape as `pickupOrderStatusLabel` /
 * `pickupOrderStatusChipClass`, so a work-order chip and a pickup chip are the
 * same object on screen.
 */

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

export function workStatusLabel(status: string | null | undefined): string | null {
  const s = coerce(status);
  return s ? LABEL[s] : null;
}

export function workStatusChipClass(status: string | null | undefined): string {
  const s = coerce(status);
  return s ? CHIP[s] : CHIP.OPEN;
}
