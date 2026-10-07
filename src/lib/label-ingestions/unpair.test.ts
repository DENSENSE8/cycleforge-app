import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnpairRestoreRecord, LabelUnpairError, planLabelUnpair, planUnpairUndo, unpairLabelIngestion, type UndoFacts, type UnpairFacts, type UnpairRestoreRecord } from './unpair';

const received = new Date('2026-10-05T12:00:00Z');
const before = new Date('2026-10-01T00:00:00Z');
const after = new Date('2026-10-05T12:00:05Z');
const LABEL = 900;

function facts(over: Partial<UnpairFacts> = {}): UnpairFacts {
  return {
    ingestion: { id: 7, state: 'APPLIED', rowVersion: 4, createdAt: received, matchedOrderId: 11, ...over.ingestion },
    orderIds: [11],
    labelShipment: { id: LABEL, trackingRaw: '1Z999AA10123456784', createdAt: after },
    orders: [{ id: 11, shipmentId: LABEL }],
    links: [{ ownerId: 11, shipmentId: LABEL, boxSeq: 1, isPrimary: true, createdAt: after }],
    labeledUnitIds: [],
    document: { id: 55, ownedByLabel: true },
    ...over,
  };
}

const unpair = { expectedRowVersion: 4, remove: false };

test('the label’s own tracking comes off: link dropped, primary pointer cleared, document deleted', () => {
  const plan = planLabelUnpair(facts({ labeledUnitIds: [3, 2, 3] }), unpair);
  assert.deepEqual(plan.dropLinks, [{ orderId: 11, shipmentId: LABEL }]);
  assert.deepEqual(plan.primaries, [{ orderId: 11, shipmentId: null, pointer: true }]);
  assert.deepEqual(plan.trackingComesOff, ['1Z999AA10123456784']);
  assert.deepEqual(plan.revertUnitIds, [2, 3]);
  assert.deepEqual(plan.document, { id: 55, action: 'delete' });
});

test('tracking that was on the order before the label was received stays', () => {
  const plan = planLabelUnpair(facts({
    labelShipment: { id: LABEL, trackingRaw: '1Z999AA10123456784', createdAt: before },
    links: [{ ownerId: 11, shipmentId: LABEL, boxSeq: 1, isPrimary: true, createdAt: before }],
  }), unpair);
  assert.deepEqual(plan.dropLinks, []);
  assert.deepEqual(plan.primaries, []);
  assert.deepEqual(plan.trackingComesOff, []);
  assert.deepEqual(plan.document, { id: 55, action: 'delete' }, 'the label document still comes off the order');
});

test('a label filed as an additional package loses only its own box', () => {
  const plan = planLabelUnpair(facts({
    orders: [{ id: 11, shipmentId: 300 }],
    links: [
      { ownerId: 11, shipmentId: 300, boxSeq: 1, isPrimary: true, createdAt: before },
      { ownerId: 11, shipmentId: LABEL, boxSeq: 2, isPrimary: false, createdAt: after },
    ],
  }), unpair);
  assert.deepEqual(plan.dropLinks, [{ orderId: 11, shipmentId: LABEL }]);
  assert.deepEqual(plan.primaries, [], 'the order’s own primary is untouched');
  assert.deepEqual(plan.trackingComesOff, ['1Z999AA10123456784']);
});

test('the label as primary with another box remaining: that box becomes primary', () => {
  const plan = planLabelUnpair(facts({
    orderIds: [11, 12],
    orders: [{ id: 11, shipmentId: LABEL }, { id: 12, shipmentId: LABEL }],
    links: [
      { ownerId: 11, shipmentId: LABEL, boxSeq: 1, isPrimary: true, createdAt: after },
      { ownerId: 11, shipmentId: 301, boxSeq: 3, isPrimary: false, createdAt: before },
      { ownerId: 11, shipmentId: 302, boxSeq: 2, isPrimary: false, createdAt: before },
      { ownerId: 12, shipmentId: LABEL, boxSeq: 1, isPrimary: true, createdAt: after },
    ],
  }), unpair);
  assert.deepEqual(plan.dropLinks, [{ orderId: 11, shipmentId: LABEL }, { orderId: 12, shipmentId: LABEL }]);
  assert.deepEqual(plan.primaries, [
    { orderId: 11, shipmentId: 302, pointer: true },
    { orderId: 12, shipmentId: null, pointer: true },
  ]);
});

test('apply’s promotion of the label over the order’s own primary is given back', () => {
  // The order pointed at 300 when the label's link was promoted primary; the pointer never moved.
  const plan = planLabelUnpair(facts({
    orders: [{ id: 11, shipmentId: 300 }],
    links: [
      { ownerId: 11, shipmentId: 300, boxSeq: 1, isPrimary: false, createdAt: before },
      { ownerId: 11, shipmentId: LABEL, boxSeq: 2, isPrimary: true, createdAt: after },
    ],
  }), unpair);
  assert.deepEqual(plan.primaries, [{ orderId: 11, shipmentId: 300, pointer: false }]);
});

test('a document apply did not create is only unlinked on unpair, deleted on remove', () => {
  const foreign = facts({ document: { id: 56, ownedByLabel: false } });
  assert.deepEqual(planLabelUnpair(foreign, unpair).document, { id: 56, action: 'unlink' });
  assert.deepEqual(planLabelUnpair(foreign, { ...unpair, remove: true }).document, { id: 56, action: 'delete' });
});

test('a stale row version, a LINKED label and an unpaired label are refused', () => {
  const code = (fn: () => unknown) => {
    try { fn(); } catch (error) { return error instanceof LabelUnpairError ? error.code : 'other'; }
    return 'none';
  };
  assert.equal(code(() => planLabelUnpair(facts(), { expectedRowVersion: 3, remove: false })), 'ROW_VERSION_CONFLICT');
  assert.equal(code(() => planLabelUnpair(facts({ ingestion: { id: 7, state: 'LINKED', rowVersion: 4, createdAt: received, matchedOrderId: 11 } }), unpair)), 'INGESTION_NOT_ACTIONABLE');
  const waiting = facts({ ingestion: { id: 7, state: 'QUARANTINED', rowVersion: 4, createdAt: received, matchedOrderId: null }, document: null });
  assert.equal(code(() => planLabelUnpair(waiting, unpair)), 'INGESTION_NOT_ACTIONABLE');
  assert.deepEqual(planLabelUnpair(waiting, { ...unpair, remove: true }).dropLinks, [], 'an unpaired label can still be removed');
});

test('unpairLabelIngestion: a stale row version throws before anything is written', async () => {
  const writes: string[] = [];
  const client = {
    query: async (sql: string) => {
      if (/^\s*(UPDATE|DELETE|INSERT)/.test(sql)) writes.push(sql);
      if (sql.includes('FROM label_ingestions')) {
        return { rows: [{ id: 7, client_event_id: 'e', state: 'APPLIED', row_version: 5, created_at: received, matched_order_id: 11, matched_account_source: null, matched_marketplace_order_id: null, tracking_number_normalized: '1Z999AA10123456784', shipment_id: LABEL, document_id: null, staged_object_key: 'k', sha256: 'a'.repeat(64), file_basename: 'l.pdf', quarantine_reason_code: null }] };
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    unpairLabelIngestion('00000000-0000-4000-8000-000000000001' as never, 7, { expectedRowVersion: 4, actor: { staffId: 2 } }, {
      runTenantTransaction: async (_org, fn) => fn(client as never),
      transitionUnit: async () => { throw new Error('must not transition'); },
      readIngestion: async () => { throw new Error('must not read'); },
      deleteStoredObject: async () => { throw new Error('must not delete'); },
    }),
    (error: unknown) => error instanceof LabelUnpairError && error.code === 'ROW_VERSION_CONFLICT',
  );
  assert.deepEqual(writes, []);
});

// ─── Undo: the exact restore ────────────────────────────────────────────────

const linkRow = (ownerId: number, shipmentId: number, boxSeq: number, isPrimary: boolean) =>
  ({ id: ownerId * 1000 + shipmentId, owner_type: 'ORDER', owner_id: ownerId, shipment_id: shipmentId, box_seq: boxSeq, is_primary: isPrimary, role: isPrimary ? 'ORDER_PRIMARY' : 'ORDER_PACKAGE', source: 'label-ingestion' });

function recordFor(f: UnpairFacts): UnpairRestoreRecord {
  const plan = planLabelUnpair(f, unpair);
  return buildUnpairRestoreRecord(f, plan, {
    ingestion: { id: 7, state: f.ingestion.state, match_method: 'MARKETPLACE_ORDER_ID', applied_at: '2026-10-05T12:01:00Z' },
    ingestionOrders: f.orderIds.map((orderId, ordinal) => ({ ingestion_id: 7, order_id: orderId, ordinal })),
    labelLinks: f.links.filter((link) => link.shipmentId === LABEL).map((link) => linkRow(link.ownerId, link.shipmentId, link.boxSeq, link.isPrimary)),
    document: { row: { id: 55, entity_type: 'ORDER', entity_id: 11 }, links: [{ document_id: 55, entity_type: 'ORDER', entity_id: 11 }] },
  });
}

const undoFacts = (record: UnpairRestoreRecord, over: Partial<UndoFacts> = {}): UndoFacts => ({
  ingestion: { state: 'QUARANTINED', quarantineReasonCode: 'OPERATOR_UNPAIRED', rowVersion: 5 },
  unpair: { rowVersion: 5, record },
  units: [],
  shipmentExists: true,
  shipmentOwnerIds: [],
  ...over,
});

test('undo restores the primary box: its link as primary and the order pointer', () => {
  const record = recordFor(facts({ labeledUnitIds: [2] }));
  assert.deepEqual(record.links, [linkRow(11, LABEL, 1, true)]);
  assert.deepEqual(record.orders, [{ orderId: 11, shipmentId: LABEL, primaryShipmentId: LABEL }]);
  assert.deepEqual(record.document?.mode, 'delete');
  assert.equal(planUnpairUndo(undoFacts(record), 5).record, record);
});

test('undo restores an additional box without touching the order’s own primary', () => {
  const record = recordFor(facts({
    orders: [{ id: 11, shipmentId: 300 }],
    links: [
      { ownerId: 11, shipmentId: 300, boxSeq: 1, isPrimary: true, createdAt: before },
      { ownerId: 11, shipmentId: LABEL, boxSeq: 2, isPrimary: false, createdAt: after },
    ],
  }));
  assert.deepEqual(record.links, [linkRow(11, LABEL, 2, false)], 'only the label’s own box is put back');
  assert.deepEqual(record.orders, [{ orderId: 11, shipmentId: 300, primaryShipmentId: 300 }]);
});

test('undo relabels only units still PACKED', () => {
  const record = recordFor(facts({ labeledUnitIds: [2, 3, 4] }));
  const plan = planUnpairUndo(undoFacts(record, { units: [{ id: 4, status: 'PACKED' }, { id: 2, status: 'PACKED' }, { id: 3, status: 'SHIPPED' }, { id: 9, status: 'PACKED' }] }), 5);
  assert.deepEqual(plan.relabelUnitIds, [2, 4]);
});

test('undo refuses a stale row version, a label that moved on, a missing record, and tracking now elsewhere', () => {
  const record = recordFor(facts());
  const code = (f: UndoFacts, version = 5) => {
    try { planUnpairUndo(f, version); } catch (error) { return error instanceof LabelUnpairError ? error.code : 'other'; }
    return 'none';
  };
  assert.equal(code(undoFacts(record), 4), 'ROW_VERSION_CONFLICT');
  assert.equal(code(undoFacts(record, { ingestion: { state: 'MATCHED', quarantineReasonCode: null, rowVersion: 5 } })), 'INGESTION_NOT_ACTIONABLE');
  assert.equal(code(undoFacts(record, { unpair: { rowVersion: 3, record } })), 'INGESTION_NOT_ACTIONABLE', 'an older unpair is not this one');
  assert.equal(code(undoFacts(record, { unpair: null })), 'INGESTION_NOT_ACTIONABLE');
  assert.equal(code(undoFacts(record, { shipmentOwnerIds: [11, 12] })), 'INGESTION_NOT_ACTIONABLE', 'order 12 is outside the label’s orders');
  assert.equal(code(undoFacts(record, { shipmentExists: false })), 'INGESTION_NOT_ACTIONABLE');
  assert.equal(code(undoFacts(record)), 'none');
});

test('undo of a label whose tracking pre-dated it: the tracking stayed on the order, nothing dropped, undo goes ahead', () => {
  // Ingestion 66 / order 15370 in the browser: unpair took the label and its document, left the tracking.
  const record = recordFor(facts({
    labelShipment: { id: LABEL, trackingRaw: '1Z999AA10123456784', createdAt: before },
    links: [{ ownerId: 11, shipmentId: LABEL, boxSeq: 1, isPrimary: true, createdAt: before }],
  }));
  assert.deepEqual(record.links, []);
  assert.deepEqual(record.orders, []);
  assert.deepEqual(record.ingestionOrders, [{ ingestion_id: 7, order_id: 11, ordinal: 0 }]);
  const plan = planUnpairUndo(undoFacts(record, { shipmentOwnerIds: [11] }), 5);
  assert.equal(plan.record, record);
});
