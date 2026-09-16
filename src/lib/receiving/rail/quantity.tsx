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
 *   - `tested`   → QC Recent: recorded verdicts / received
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

/** Recorded-verdict count for the QC rail — prefers API `tested_count`. */
export function getTestedQty(row: ReceivingLineRow): number {
  if (typeof row.tested_count === 'number') {
    return Math.min(row.tested_count, row.quantity_received);
  }
  const v = String(row.workflow_status || '').trim().toUpperCase();
  const isTested = ['PASSED', 'DONE', 'FAILED', 'SCRAP', 'RTV'].some((s) => v.startsWith(s));
  return isTested ? row.quantity_received : 0;
}

function renderTestedQty(row: ReceivingLineRow): ReactNode {
  const tested = getTestedQty(row);
  const received = row.quantity_received;
  return (
    <span className={tested >= received && received > 0 ? 'text-text-success' : 'text-text-muted'}>
      {tested}/{received}
    </span>
  );
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
  tested: {
    previewQtyLabel: 'Tested',
    renderQuantity: renderTestedQty,
    getPreviewQty: (row: ReceivingLineRow): RailPreviewQty => ({
      current: getTestedQty(row),
      total: row.quantity_received,
    }),
  },
} as const;

export type RailQtyId = keyof typeof RAIL_QTY;
