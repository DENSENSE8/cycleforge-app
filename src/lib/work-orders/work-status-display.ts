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

import type { WorkStatus } from '@/lib/work-orders/types';

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

/**
 * Leading dot (`bg-*` only — the fill IS the dot).
 *
 * The module docblock has promised "label · tone · dot" since it was written,
 * but only LABEL and CHIP existed, so every consumer rendered a dotless chip
 * while Receiving — which has its own `workflowStageDot` — rendered dot · chip.
 * Same state, two shapes, because half the SoT was missing rather than because
 * anyone chose differently.
 *
 * Hues track CHIP's families at the 400/500 step Receiving uses, so a work
 * status and a receiving stage read as the same object on screen.
 */
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
