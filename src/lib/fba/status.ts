/**
 * Canonical FBA shipment/item status vocabulary — the single source of truth.
 * Operator-facing lifecycle (see 2026-05-28_fba_status_rename_tested_packed.sql):
 */

import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';

/** Board sort order — lowest sorts first. Side states sit after the path. */
export const FBA_STATUS_ORDER: Record<string, number> = {
  PACKED: 0, // combiner's queue surfaces first
  TESTED: 1,
  PLANNED: 2,
  OUT_OF_STOCK: 3,
  LABEL_ASSIGNED: 4,
  SHIPPED: 5,
  CLOSED: 6,
};

/** Operator-facing display labels. LABEL_ASSIGNED reads as "Combined". */
export const FBA_STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  TESTED: 'Tested',
  PACKED: 'Packed',
  LABEL_ASSIGNED: 'Combined',
  SHIPPED: 'Shipped',
  OUT_OF_STOCK: 'Out of Stock',
  CLOSED: 'Closed',
};

/** Status-pill background+text classes (single source of truth, beside the labels). */
const FBA_STATUS_PILL: Record<string, string> = {
  PLANNED: 'bg-amber-100 text-amber-700',
  TESTED: 'bg-emerald-100 text-emerald-700',
  PACKED: LIFECYCLE_CLASSES.packed.pill,
  SHIPPED: LIFECYCLE_CLASSES.shipped.pill,
  OUT_OF_STOCK: 'bg-red-100 text-red-700',
  LABEL_ASSIGNED: 'bg-green-100 text-green-700',
};

/** Pill classes for an FBA status (case-insensitive); safe for unknowns. */
export function fbaStatusPillClass(status: string): string {
  return FBA_STATUS_PILL[status.toUpperCase()] ?? 'bg-surface-sunken text-text-muted';
}

