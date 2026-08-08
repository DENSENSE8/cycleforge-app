/**
 * Receiving sidebar-rail quantity logic — per-feed "how does this row count?"
 * rendered into the rail row's meta and the hover-popover progress meter.
 *
 * ## Unboxed ≠ Received (hard law)
 *
 * Operator **Received** on these meters means inventory-confirmed (or local-only
 * done via `isOperatorReceived`) — never floor `quantity_received` alone.
 * Coarse UNBOXED (awaiting inventory confirm) must paint **0/expected** with an
 * empty bar even when units were already counted on the floor.
 *
 * - **Do:** route every Received-labeled qty through `inventoryReceivedDisplayQty`
 *   / `RAIL_QTY.received` (and `unfound`, which shares that gate).
 * - **Never:** paint Received from raw `row.quantity_received`; "fix" Unboxed
 *   looking complete with blue bars, fill caps, or muted greens while still
 *   showing floor `1/1` under a Received label.
 *
 * Guard: `rail-received-qty.guard.test.ts`. SoT: source-of-truth.md → Unboxed ≠ Received.
 * Tip copy for pending confirm: `unboxed-sync-tooltip.ts`.
 *
 * Four strategies, one per quantity semantic the receiving rails use:
 *   - `received` → Unboxed / Viewed: inventory-received / expected (see law above).
 *   - `scanned`  → Queue / Prioritize: door scan = whole carton ("1/1", never "0/1").
 *   - `unfound`  → Unfound stubs: same inventory-received gate as `received`.
 *   - `combined` → Triage union: unmatched→unfound, else→scanned.
 *
 * Row anatomy + popover shell live in RecentActivityRailBase — they must call
 * `getPreviewQty` / `RAIL_QTY`, never re-derive Received from the row column.
 */

import type { ReactNode } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { isOperatorReceived } from '@/lib/receiving/rail/status';

/** { current, total } for the hover-popover progress meter. */
export interface RailPreviewQty {
  current: number;
  total: number | null;
}

/** True when the operator Received stage is done (inventory confirmed / local done). */
export function isRailQtyInventoryComplete(row: ReceivingLineRow): boolean {
  return isOperatorReceived(row);
}

/**
 * Qty shown on the "Received" meter. Until inventory confirm, current is 0 —
 * Unboxed ≠ Received, even when `quantity_received` already counts floor units.
 */
export function inventoryReceivedDisplayQty(row: ReceivingLineRow): RailPreviewQty {
  const total = row.quantity_expected;
  if (!isRailQtyInventoryComplete(row)) {
    return { current: 0, total };
  }
  return { current: row.quantity_received, total };
}

/**
 * Hover tip for **Qty** fractions (grids · context). Floor unit count uses the
 * verb **counted** — never "received" (that noun is inventory-confirmed only).
 */
export function floorQtyFractionTip(
  counted: number,
  expected: number | null | undefined,
): string {
  if (expected == null) {
    return `${counted} counted · expected count unknown (no PO line matched yet)`;
  }
  return `${counted} of ${expected} counted`;
}

/** Inline quantity for the Unboxed + Viewed rails — inventory-received / expected. */
function renderReceivedQty(row: ReceivingLineRow): ReactNode {
  const { current, total } = inventoryReceivedDisplayQty(row);
  return (
    <span
      className={
        total != null && current >= total && total > 0
          ? 'text-emerald-600'
          : 'text-text-muted'
      }
    >
      {current}/{total ?? '?'}
    </span>
  );
}

/**
 * SCANNED semantics — every row in the view=scanned feed has
 * quantity_received = 0 by definition (it drops out the instant it's unboxed), so
 * a door scan brings the WHOLE carton in physically: scanned == expected.
 * Falls back to 1/? when the expected qty is unknown.
 */
function renderScannedQty(row: ReceivingLineRow): ReactNode {
  const expected = row.quantity_expected;
  return (
    <span className="text-text-muted">
      {expected ?? 1}/{expected ?? '?'}
    </span>
  );
}

/** Unfound stubs — same inventory-received gate as the Received rails. */
function renderUnfoundQty(row: ReceivingLineRow): ReactNode {
  const { current, total } = inventoryReceivedDisplayQty(row);
  return (
    <span className="text-text-muted">
      {current}/{total ?? '?'}
    </span>
  );
}

/** Triage union: unmatched stubs read as unfound, matched scanned cartons as scanned. */
function renderCombinedQty(row: ReceivingLineRow): ReactNode {
  return row.receiving_source === 'unmatched' ? renderUnfoundQty(row) : renderScannedQty(row);
}

const receivedPreview = (row: ReceivingLineRow): RailPreviewQty =>
  inventoryReceivedDisplayQty(row);
const scannedPreview = (row: ReceivingLineRow): RailPreviewQty => ({
  current: row.quantity_expected ?? 1,
  total: row.quantity_expected,
});

/**
 * Quantity-strategy registry. A rail feed selects one by id; the row renderer,
 * popover label, and popover progress values are resolved here.
 */
export const RAIL_QTY = {
  received: {
    previewQtyLabel: 'Received',
    renderQuantity: renderReceivedQty,
    getPreviewQty: receivedPreview,
  },
  scanned: {
    previewQtyLabel: 'Scanned',
    renderQuantity: renderScannedQty,
    getPreviewQty: scannedPreview,
  },
  unfound: {
    previewQtyLabel: 'Received',
    renderQuantity: renderUnfoundQty,
    getPreviewQty: receivedPreview,
  },
  combined: {
    previewQtyLabel: 'Scanned',
    renderQuantity: renderCombinedQty,
    getPreviewQty: (row: ReceivingLineRow): RailPreviewQty =>
      row.receiving_source === 'unmatched' ? receivedPreview(row) : scannedPreview(row),
  },
} as const;

export type RailQtyId = keyof typeof RAIL_QTY;
