import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  labelTrailNote,
  linkOrderLabel,
  unlinkOrderLabel,
  type InsertLinkInput,
  type OrderLabelLinkDeps,
  type ResolvedLabel,
  type UnlinkRow,
} from './order-label-links';

/**
 * DB-free: Link label / Unlink orchestration — what reaches the ledger, the
 * ingestion quarantine and the order's tracking for each decision.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/shipping/order-label-links.test.ts
 */

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const ORDER = 42;

function resolved(over: Partial<ResolvedLabel> = {}): ResolvedLabel {
  return {
    labelId: 'se-900',
    shipstationShipmentId: 900,
    voided: false,
    isReturnLabel: false,
    trackingNumber: '1Z999AA10123456784',
    carrierCode: 'ups',
    serviceCode: 'ups_ground',
    cost: 11.2,
    insuranceCost: null,
    ingestion: null,
    liveRow: null,
    ...over,
  };
}

interface Captured {
  inserts: InsertLinkInput[];
  tracking: string[];
  shipmentIds: Array<[number, number]>;
  unlinked: Array<{ rowId: number; reopenIngestion: boolean }>;
  trackingRemoved: number[];
}

function fakes(opts: { label?: ResolvedLabel | null; prior?: { id: number; orderId: number | null } | null; unlinkRow?: UnlinkRow | null } = {}) {
  const cap: Captured = { inserts: [], tracking: [], shipmentIds: [], unlinked: [], trackingRemoved: [] };
  const deps: OrderLabelLinkDeps = {
    readOrderRef: async (org, id) => {
      assert.equal(org, ORG);
      return id === ORDER ? { orderRef: 'A-1' } : null;
    },
    resolveLabel: async () => (opts.label === undefined ? resolved() : opts.label),
    insertLink: async (input) => {
      cap.inserts.push(input);
      return { id: 501 };
    },
    findByClientEvent: async () => opts.prior ?? null,
    linkTracking: async ({ trackingNumber }) => {
      cap.tracking.push(trackingNumber);
      return 77;
    },
    setShipmentId: async (_org, rowId, shipmentId) => {
      cap.shipmentIds.push([rowId, shipmentId]);
    },
    readUnlinkRow: async () => opts.unlinkRow ?? null,
    markUnlinked: async ({ row, reopenIngestion }) => {
      cap.unlinked.push({ rowId: row.id, reopenIngestion });
    },
    unlinkTracking: async ({ shipmentId }) => {
      cap.trackingRemoved.push(shipmentId);
    },
  };
  return { deps, cap };
}

const linkInput = (purpose: 'outbound' | 'return' | 'replacement') => ({
  orgId: ORG,
  orderId: ORDER,
  shipmentId: 900,
  purpose,
  clientEventId: 'evt-link-1',
  staffId: 3,
});

test('link: the quarantined second label is paired as a replacement — ingestion resolved in the insert, tracking joins the order', async () => {
  const { deps, cap } = fakes({ label: resolved({ ingestion: { id: 7, state: 'QUARANTINED', matchedOrderId: null } }) });
  const out = await linkOrderLabel(linkInput('replacement'), deps);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.resolvedIngestionId, 7);
  assert.equal(out.trackingShipmentId, 77);
  assert.equal(cap.inserts.length, 1);
  assert.equal(cap.inserts[0]!.resolveIngestionId, 7);
  assert.equal(cap.inserts[0]!.purpose, 'replacement');
  assert.equal(cap.inserts[0]!.orderId, ORDER);
  assert.equal(cap.inserts[0]!.orgId, ORG);
  assert.equal(cap.inserts[0]!.staffId, 3);
  assert.deepEqual(cap.tracking, ['1Z999AA10123456784']);
  assert.deepEqual(cap.shipmentIds, [[501, 77]]);
});

test('link: a return is recorded but never joins the order tracking', async () => {
  const { deps, cap } = fakes({ label: resolved({ isReturnLabel: true }) });
  const out = await linkOrderLabel(linkInput('return'), deps);
  assert.equal(out.ok && out.purpose, 'return');
  assert.equal(cap.inserts.length, 1);
  assert.deepEqual(cap.tracking, []);
  assert.deepEqual(cap.shipmentIds, []);
});

test('link: a refused pairing writes nothing', async () => {
  const { deps, cap } = fakes({ label: resolved({ isReturnLabel: true }) });
  const out = await linkOrderLabel(linkInput('outbound'), deps);
  assert.deepEqual(out.ok ? null : [out.status, out.code], [400, 'RETURN_LABEL_PURPOSE']);
  assert.equal(cap.inserts.length + cap.tracking.length, 0);
});

test('link: a retried request key replays; the key used for another order is refused', async () => {
  const replay = fakes({ prior: { id: 501, orderId: ORDER } });
  const out = await linkOrderLabel(linkInput('outbound'), replay.deps);
  assert.equal(out.ok && out.idempotent, true);
  assert.equal(replay.cap.inserts.length, 0);

  const reused = fakes({ prior: { id: 501, orderId: 99 } });
  const bad = await linkOrderLabel(linkInput('outbound'), reused.deps);
  assert.equal(bad.ok ? null : bad.code, 'CLIENT_EVENT_REUSED');
});

test('link: unknown order and unknown label are 404s', async () => {
  const { deps } = fakes({ label: null });
  const noLabel = await linkOrderLabel(linkInput('return'), deps);
  assert.equal(noLabel.ok ? null : noLabel.code, 'LABEL_NOT_FOUND');
  const noOrder = await linkOrderLabel({ ...linkInput('return'), orderId: 5 }, fakes().deps);
  assert.equal(noOrder.ok ? null : noOrder.code, 'ORDER_NOT_FOUND');
});

test('unlink: a paired quarantine reopens and the tracking the pairing added comes off', async () => {
  const row: UnlinkRow = {
    id: 501, orderId: ORDER, status: 'purchased', purpose: 'replacement', creationType: 'linked_manually',
    labelIngestionId: 7, ingestionState: 'LINKED', shipmentId: 77, trackingNumber: 'T', labelId: 'se-900',
  };
  const { deps, cap } = fakes({ unlinkRow: row });
  const out = await unlinkOrderLabel({ orgId: ORG, orderId: ORDER, rowId: 501, staffId: 3 }, deps);
  assert.equal(out.ok && out.reopenedIngestionId, 7);
  assert.deepEqual(cap.unlinked, [{ rowId: 501, reopenIngestion: true }]);
  assert.deepEqual(cap.trackingRemoved, [77]);
});

test('unlink: a bought-here label is refused and nothing changes', async () => {
  const row: UnlinkRow = {
    id: 9, orderId: ORDER, status: 'purchased', purpose: 'outbound', creationType: 'bought_in_app',
    labelIngestionId: null, ingestionState: null, shipmentId: 5, trackingNumber: 'T', labelId: 'se-1',
  };
  const { deps, cap } = fakes({ unlinkRow: row });
  const out = await unlinkOrderLabel({ orgId: ORG, orderId: ORDER, rowId: 9, staffId: 3 }, deps);
  assert.equal(out.ok ? null : out.code, 'LABEL_BOUGHT_HERE');
  assert.deepEqual(cap.unlinked, []);
  assert.deepEqual(cap.trackingRemoved, []);
});

test('trail note names the purpose, carrier and tracking', () => {
  assert.equal(
    labelTrailNote('Linked', 'return', { carrierCode: 'ups_walleted', trackingNumber: '1Z9', labelId: 'se-1' }),
    'Linked return label · UPS 1Z9',
  );
});
