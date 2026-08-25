/**
 * Receiving sidebar-rail quantity — floor units counted vs expected.
 *
 * The meter shows `receiving_line.quantity_received`. Zoho does not zero it.
 * Staff face is the local row; provider confirmation is a hover tip, not a 0/1.
 *
 * Four strategies:
 *   - `received` → Unboxed / Viewed: counted / expected
 *   - `scanned`  → Queue / Prioritize: door scan = whole carton
 *   - `unfound`  → Unfound stubs: same counted/expected as `received`
 *   - `combined` → Triage union: unmatched→unfound, else→scanned
 *
 * Row anatomy + popover live in RecentActivityRailBase — they call
 * `getPreviewQty` / `RAIL_QTY`.
 */

import type { ReactNode } from 'react';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isOperatorReceived } from '@/lib/receiving/rail/status';

/** { current, total } for the hover-popover progress meter. */
export interface RailPreviewQty {
  current: number;
  total: number | null;
}

/** True when the coarse rail stage is Received. */
export function isRailQtyInventoryComplete(row: ReceivingLineRow): boolean {
  return isOperatorReceived(row);
}

/** Qty on the recent-rail meter — local `quantity_received`, always. */
export function inventoryReceivedDisplayQty(row: ReceivingLineRow): RailPreviewQty {
  return {
    current: row.quantity_received ?? 0,
    total: row.quantity_expected,
  };
}

export function floorQtyFractionTip(
  counted: number,
  expected: number | null | undefined,
): string {
  if (expected == null) {
    return `${counted} counted · expected count unknown (no PO line matched yet)`;
  }
  return `${counted} of ${expected} counted`;
}

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

function renderScannedQty(row: ReceivingLineRow): ReactNode {
  const expected = row.quantity_expected;
  return (
    <span className="text-text-muted">
      {expected ?? 1}/{expected ?? '?'}
    </span>
  );
}

function renderUnfoundQty(row: ReceivingLineRow): ReactNode {
  const { current, total } = inventoryReceivedDisplayQty(row);
  return (
    <span className="text-text-muted">
      {current}/{total ?? '?'}
    </span>
  );
}

function renderCombinedQty(row: ReceivingLineRow): ReactNode {
  return row.receiving_source === 'unmatched' ? renderUnfoundQty(row) : renderScannedQty(row);
}

const receivedPreview = (row: ReceivingLineRow): RailPreviewQty =>
  inventoryReceivedDisplayQty(row);
const scannedPreview = (row: ReceivingLineRow): RailPreviewQty => ({
  current: row.quantity_expected ?? 1,
  total: row.quantity_expected,
});

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
