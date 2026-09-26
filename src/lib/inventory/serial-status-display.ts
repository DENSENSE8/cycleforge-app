/** Serial-unit lifecycle status → display (label + dot class). */

import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';

interface SerialStatusMeta {
  /** Short, glanceable label. */
  label: string;
  /** Tailwind `bg-*` class for the status dot. */
  dot: string;
}

const SERIAL_STATUS_META: Record<string, SerialStatusMeta> = {
  RECEIVED: { label: 'Received', dot: 'bg-border-emphasis' },
  TRIAGED: { label: 'Triaged', dot: 'bg-border-emphasis' },
  IN_TEST: { label: 'In test', dot: 'bg-blue-500' },
  TESTED: { label: 'Tested', dot: 'bg-blue-500' },
  GRADED: { label: 'Graded', dot: 'bg-blue-500' },
  STOCKED: { label: 'In stock', dot: 'bg-emerald-500' },
  ALLOCATED: { label: 'Allocated', dot: 'bg-blue-500' },
  PICKING: { label: 'Picking', dot: 'bg-blue-500' },
  PICKED: { label: 'Picked', dot: 'bg-blue-500' },
  PACKING: { label: 'Packing', dot: 'bg-blue-500' },
  PACKED: { label: 'Packed', dot: LIFECYCLE_CLASSES.packed.dot },
  LABELED: { label: 'Labeled', dot: 'bg-blue-500' },
  STAGED: { label: 'Staged', dot: 'bg-blue-500' },
  LOADING: { label: 'Loading', dot: 'bg-blue-500' },
  SHIPPED: { label: 'Shipped', dot: LIFECYCLE_CLASSES.shipped.dot },
  RETURNED: { label: 'Returned', dot: 'bg-violet-500' },
  RMA: { label: 'RMA', dot: 'bg-violet-500' },
  IN_REPAIR: { label: 'In repair', dot: 'bg-violet-500' },
  REPAIR_DONE: { label: 'Repaired', dot: 'bg-violet-500' },
  ON_HOLD: { label: 'On hold', dot: 'bg-amber-500' },
  SCRAPPED: { label: 'Scrapped', dot: 'bg-rose-500' },
  UNKNOWN: { label: 'Unknown', dot: 'bg-surface-strong' },
};

const UNKNOWN_STATUS: SerialStatusMeta = SERIAL_STATUS_META.UNKNOWN;

function meta(status: string | null | undefined): SerialStatusMeta {
  const key = String(status ?? '').trim().toUpperCase();
  return SERIAL_STATUS_META[key] ?? UNKNOWN_STATUS;
}

/** Short human label for a serial-unit lifecycle status. */
export function serialStatusLabel(status: string | null | undefined): string {
  return meta(status).label;
}

/** Tailwind `bg-*` class for the serial-unit status dot. */
export function serialStatusDot(status: string | null | undefined): string {
  return meta(status).dot;
}
