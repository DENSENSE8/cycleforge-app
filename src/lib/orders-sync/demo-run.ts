/**
 * A scripted order-import run — the sample data behind the "Demo sync" button.
 * Operator 2026-09-15: *"I need a testing button instead of the same Google
 */
import type { SyncRunLane, SyncRunOutcomeLine } from './run-steps';
import type { SyncStreamEvent, TransferOrderDetail, TransferTabState } from './types';

export interface DemoRunBeat {
  /** Milliseconds after the previous beat. */
  after: number;
  lane: SyncRunLane;
  event: SyncStreamEvent;
}

function detailRow(orderId: string, productTitle: string): TransferOrderDetail {
  return {
    orderId,
    productTitle,
    sku: '',
    itemNumber: orderId.replace(/\D/g, '').slice(0, 6),
    tracking: `1Z999AA1${orderId.replace(/\D/g, '').slice(0, 7)}`,
    titleSource: 'sku_catalog',
  };
}

/** Paced like a real ShipStation import: */
export const DEMO_RUN_SCRIPT: readonly DemoRunBeat[] = [
  { after: 200, lane: 'shipstation', event: { type: 'phase', phase: 'starting' } },
  { after: 400, lane: 'shipstation', event: { type: 'phase', phase: 'fetching_shipstation' } },
  {
    after: 1600,
    lane: 'shipstation',
    event: { type: 'phase', phase: 'fetching_shipstation', count: 214 },
  },
  {
    after: 1800,
    lane: 'shipstation',
    event: { type: 'phase', phase: 'resolving_tracking', count: 51 },
  },
  { after: 1400, lane: 'shipstation', event: { type: 'phase', phase: 'updating', count: 9 } },
  { after: 900, lane: 'shipstation', event: { type: 'phase', phase: 'inserting', count: 35 } },
  { after: 900, lane: 'shipstation', event: { type: 'phase', phase: 'done' } },
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

/**
 * The roll-up sentence, in the exact grammar `useOrdersSync` composes for a
 * real run ("Orders synced: 35 inserted, 9 updated").
 */
export const DEMO_RUN_OUTCOME: SyncRunOutcomeLine = {
  type: 'success',
  message: 'Orders synced: 35 inserted, 9 updated',
};

/**
 * Sample per-row detail, in the same {@link TransferTabState} shape the real
 * connector returns — so "Rows to fix" on a demo run exercises the identical
 * grouping and hints as production.
 */
export const DEMO_RUN_DETAIL_TAB: TransferTabState = {
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
  },
};
