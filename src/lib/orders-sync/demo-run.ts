/**
 * A scripted order-import run — the sample data behind the "Demo sync" button.
 *
 * Operator 2026-09-15: *"I need a testing button instead of the same Google
 * Sheets real production button … when I press the input button that's real it
 * would display exactly the same."*
 *
 * So this is deliberately NOT a second UI. It is a list of the same
 * {@link SyncStreamEvent}s the real route streams, on the same three lanes,
 * replayed on a timer into the same {@link applySyncRunEvent} fold. The run
 * surface cannot tell the difference — which is the whole point: whatever the
 * demo shows is what production shows.
 *
 * Nothing here touches the network or the database. The only visible tell is
 * the `demo` flag the surface paints in its eyebrow, so a screenshot of sample
 * numbers is never mistaken for a real import.
 */
import type { SyncRunLane, SyncRunOutcomeLine } from './run-steps';
import type {
  SyncStreamEvent,
  TransferOrderDetail,
  TransferSkippedRow,
  TransferTabState,
} from './types';

export interface DemoRunBeat {
  /** Milliseconds after the previous beat. */
  after: number;
  lane: SyncRunLane;
  event: SyncStreamEvent;
}

function detail(orderId: string, productTitle: string): SyncStreamEvent {
  return {
    type: 'detail',
    kind: 'inserted',
    row: {
      orderId,
      productTitle,
      sku: '',
      itemNumber: orderId.replace(/\D/g, '').slice(0, 6),
      tracking: `1Z999AA1${orderId.replace(/\D/g, '').slice(0, 7)}`,
      titleSource: 'sheet',
    },
  };
}

function detailRow(orderId: string, productTitle: string): TransferOrderDetail {
  return {
    orderId,
    productTitle,
    sku: '',
    itemNumber: orderId.replace(/\D/g, '').slice(0, 6),
    tracking: `1Z999AA1${orderId.replace(/\D/g, '').slice(0, 7)}`,
    titleSource: 'sheet',
  };
}

function skippedRow(
  reason: TransferSkippedRow['reason'],
  sheetRow: number,
  orderId: string,
  productTitle: string,
): TransferSkippedRow {
  return { reason, sheetRow, orderId, productTitle, platform: 'eBay', tracking: '' };
}

/**
 * Paced like a real sheet import: the read lands fast, tracking resolution is
 * the long pole, inserts come in a burst, exceptions trail the rest. Total
 * ≈ 11s — long enough to watch steps advance, short enough to press twice.
 */
export const DEMO_RUN_SCRIPT: readonly DemoRunBeat[] = [
  { after: 200, lane: 'sheets', event: { type: 'phase', phase: 'starting' } },
  { after: 150, lane: 'ecwid', event: { type: 'phase', phase: 'starting' } },
  { after: 400, lane: 'sheets', event: { type: 'phase', phase: 'fetching_sheet' } },
  { after: 300, lane: 'ecwid', event: { type: 'phase', phase: 'fetching_ecwid' } },
  {
    after: 1200,
    lane: 'sheets',
    event: { type: 'phase', phase: 'fetching_sheet', count: 214, message: 'Sept 2026' },
  },
  { after: 500, lane: 'ecwid', event: { type: 'phase', phase: 'fetching_ecwid', count: 18 } },
  {
    after: 600,
    lane: 'sheets',
    event: { type: 'phase', phase: 'resolving_tracking', count: 51 },
  },
  { after: 400, lane: 'ecwid', event: { type: 'phase', phase: 'resolving_tracking', count: 6 } },
  { after: 1400, lane: 'sheets', event: { type: 'phase', phase: 'matching_orders' } },
  { after: 300, lane: 'ecwid', event: { type: 'phase', phase: 'matching_orders' } },
  // Two `updating` beats on one lane: deletes, then backfills. The ledger
  // accumulates them (3 + 9 = 12) — the case a naive fold renders backwards.
  { after: 700, lane: 'sheets', event: { type: 'phase', phase: 'updating', count: 3 } },
  { after: 450, lane: 'sheets', event: { type: 'phase', phase: 'updating', count: 9 } },
  { after: 500, lane: 'sheets', event: { type: 'phase', phase: 'inserting', count: 35 } },
  { after: 120, lane: 'sheets', event: detail('EB-44127', 'Dell Latitude 7420 · i7 · 16GB') },
  { after: 120, lane: 'sheets', event: detail('EB-44128', 'HP EliteBook 840 G8 · i5') },
  { after: 120, lane: 'sheets', event: detail('EB-44131', 'Lenovo ThinkPad T14 · Ryzen 5') },
  { after: 400, lane: 'ecwid', event: { type: 'phase', phase: 'inserting', count: 4 } },
  { after: 600, lane: 'sheets', event: { type: 'phase', phase: 'publishing' } },
  { after: 250, lane: 'ecwid', event: { type: 'phase', phase: 'publishing' } },
  { after: 500, lane: 'ecwid', event: { type: 'phase', phase: 'done' } },
  { after: 300, lane: 'sheets', event: { type: 'phase', phase: 'done' } },
  { after: 400, lane: 'exceptions', event: { type: 'phase', phase: 'scanning_exceptions' } },
  {
    after: 500,
    lane: 'exceptions',
    event: { type: 'exception', kind: 'resolved', row: { exceptionId: 9001, tracking: '1Z999AA10123456', matchedOrderId: 44127 } },
  },
  {
    after: 250,
    lane: 'exceptions',
    event: { type: 'exception', kind: 'resolved', row: { exceptionId: 9002, tracking: '1Z999AA10123999', matchedOrderId: 44131 } },
  },
  {
    after: 250,
    lane: 'exceptions',
    event: { type: 'exception', kind: 'open', row: { exceptionId: 9003, tracking: '9400111899560000', sourceStation: 'pack' } },
  },
  {
    after: 250,
    lane: 'exceptions',
    event: { type: 'exception', kind: 'open', row: { exceptionId: 9004, tracking: '9400111899561111', sourceStation: 'unbox' } },
  },
  { after: 600, lane: 'exceptions', event: { type: 'phase', phase: 'done' } },
] as const;

/** Sheet tab the scripted run "read", so the header shows the same provenance. */
export const DEMO_RUN_TAB_NAME = 'Sept 2026';

/**
 * The roll-up sentence, in the exact grammar `useOrdersSync` composes for a
 * real run ("Orders synced: 39 inserted, 12 updated, …").
 */
export const DEMO_RUN_OUTCOME: SyncRunOutcomeLine = {
  type: 'success',
  message: 'Orders synced: 39 inserted, 12 updated (7 tracking), 2 exceptions resolved, 21 need a fix',
};

/**
 * Sample per-row detail, in the same {@link TransferTabState} shape the real
 * connectors return — so "Rows to fix" on a demo run exercises the identical
 * grouping, hints and fix links as production, including the two skip reasons
 * that are NOT problems (Ecwid-sourced rows, FBA boxes) and the padding that is
 * counted but never listed.
 */
export const DEMO_RUN_DETAIL_TABS: {
  sheets: TransferTabState;
  ecwid: TransferTabState;
} = {
  sheets: {
    status: 'done',
    details: {
      inserted: [
        detailRow('EB-44127', 'Dell Latitude 7420 · i7 · 16GB'),
        detailRow('EB-44128', 'HP EliteBook 840 G8 · i5'),
        detailRow('EB-44131', 'Lenovo ThinkPad T14 · Ryzen 5'),
      ],
      updated: [detailRow('EB-44002', 'Bose SoundLink Revolve+ · tracking attached')],
      deleted: [],
      unknownTitle: [],
      unresolvedTracking: [],
      unmatchedCatalog: [detailRow('EB-44133', 'Unbranded dock · item number not in catalog')],
      skippedRows: [
        skippedRow('noItemNumber', 18, 'EB-44140', 'Sony WH-1000XM4 · black'),
        skippedRow('noItemNumber', 24, 'EB-44151', 'Logitech MX Master 3S'),
        skippedRow('noTracking', 31, 'EB-44155', 'Anker 737 power bank'),
        skippedRow('ecwid', 44, 'EC-9001', 'Bose 321 remote · Ecwid store'),
        skippedRow('fbaShipment', 57, 'FBA15X9', 'FBA inbound box 3 of 6'),
        skippedRow('blankRow', 91, '', ''),
        skippedRow('blankRow', 92, '', ''),
      ],
      recoveredRows: [],
    },
  },
  ecwid: {
    status: 'done',
    details: {
      inserted: [detailRow('EC-9014', 'Bose Companion 2 · Ecwid direct')],
      updated: [],
      deleted: [],
      unknownTitle: [],
      unresolvedTracking: [],
      unmatchedCatalog: [],
      skippedRows: [],
      recoveredRows: [],
    },
  },
};
