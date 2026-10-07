import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRecordOrderNumber, type RecordOrderNumberDeps } from './order-number';
import type { OutboundLineRow, InboundLineRow, InboundOrderRow } from './repo';
import type { RecordAuditEntry, RecordWriteActor, Tx } from './types';

const ORG = '00000000-0000-0000-0000-0000000000aa';

const line = (id: number, orderNumber: string, externalLineId: string | null, accountSource = 'ebay'): OutboundLineRow => ({
  id,
  orderNumber,
  accountSource,
  externalLineId,
  platformLabel: accountSource === 'ebay' ? 'eBay' : accountSource,
  primaryShipmentId: null,
  linkedShipmentIds: [],
});

function fakes(opts: {
  outbound?: OutboundLineRow[];
  inbound?: InboundLineRow[];
  inboundOrders?: InboundOrderRow[];
  collision?: { externalLineId: string; platformLabel: string } | null;
  rowCounts?: Record<string, number>;
  openPayments?: string[];
}) {
  const writes = {
    rekey: [] as Array<[number[], string]>,
    payments: [] as Array<[string[], string]>,
    renames: [] as Array<[number, string, number | null]>,
    collisionLookups: [] as Array<[string, number[]]>,
  };
  const audits: RecordAuditEntry[] = [];
  const deps: RecordOrderNumberDeps = {
    runInTx: async (orgId, fn) => {
      assert.equal(orgId, ORG);
      return fn({} as Tx);
    },
    loadOutboundLines: async (_tx, _org, ids) => (opts.outbound ?? []).filter((l) => ids.includes(l.id)),
    loadInboundLines: async (_tx, _org, ids) => (opts.inbound ?? []).filter((l) => ids.includes(l.id)),
    findOrderNumberCollision: async (_tx, orgId, orderNumber, lines) => {
      assert.equal(orgId, ORG);
      writes.collisionLookups.push([orderNumber, lines.map((l) => l.id)]);
      return opts.collision ?? null;
    },
    orderRowCounts: async (_tx, _org, numbers) => new Map(numbers.map((n) => [n, opts.rowCounts?.[n] ?? 99])),
    openPaymentOrderNumbers: async (_tx, _org, numbers) => new Set(numbers.filter((n) => (opts.openPayments ?? []).includes(n))),
    rekeyOrderLines: async (_tx, _org, ids, next) => {
      writes.rekey.push([[...ids], next]);
    },
    moveOrderPayments: async (_tx, _org, from, to) => {
      writes.payments.push([[...from], to]);
    },
    loadInboundOrders: async (_tx, _org, ids) => (opts.inboundOrders ?? []).filter((o) => ids.includes(o.id)),
    renameInboundOrder: async (_tx, _org, id, next, identityLineId) => {
      writes.renames.push([id, next, identityLineId]);
    },
  };
  const actor: RecordWriteActor = { orgId: ORG, staffId: 3, audit: async (_tx, e) => void audits.push(e) };
  return { deps, actor, writes, audits };
}

const out = (id: number) => ({ direction: 'outbound' as const, id });
const inn = (id: number) => ({ direction: 'inbound' as const, id });

test('collision with a line outside the request: 409 for the whole request, nothing written', async () => {
  const f = fakes({
    outbound: [line(1, 'A-1', 'L1'), line(2, 'A-1', 'L2')],
    collision: { externalLineId: 'L2', platformLabel: 'eBay' },
  });
  const res = await changeRecordOrderNumber({ targets: [out(1), out(2)], orderNumber: 'B-2' }, f.actor, f.deps);
  assert.deepEqual(res, { ok: false, error: 'Order B-2 already has a line L2 on eBay' });
  assert.deepEqual(f.writes.rekey, []);
  assert.deepEqual(f.audits, []);
  assert.deepEqual(f.writes.collisionLookups, [['B-2', [1, 2]]]);
});

test('two named lines that would share one key under the new number: 409, nothing written', async () => {
  const f = fakes({ outbound: [line(1, 'A-1', 'L1'), line(2, 'C-3', 'L1')] });
  const res = await changeRecordOrderNumber({ targets: [out(1), out(2)], orderNumber: 'B-2' }, f.actor, f.deps);
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : '', /Order B-2 already has a line L1 on eBay/);
  assert.deepEqual(f.writes.rekey, []);
});

test('lines without an external line id never collide (unique index semantics)', async () => {
  const f = fakes({ outbound: [line(1, 'A-1', null), line(2, 'C-3', null)] });
  const res = await changeRecordOrderNumber({ targets: [out(1), out(2)], orderNumber: 'B-2' }, f.actor, f.deps);
  assert.equal(res.ok, true);
});

test('re-keys only the named lines that move, audits each before/after', async () => {
  const f = fakes({ outbound: [line(1, 'A-1', 'L1'), line(2, 'B-2', 'L2')], rowCounts: { 'A-1': 3 } });
  const res = await changeRecordOrderNumber({ targets: [out(1), out(2)], orderNumber: 'B-2' }, f.actor, f.deps);
  assert.ok(res.ok);
  assert.deepEqual(res.outcome.results.map((r) => r.outcome), ['done', 'done']);
  assert.deepEqual(f.writes.rekey, [[[1], 'B-2']], 'line 2 already carries B-2');
  assert.deepEqual(f.writes.collisionLookups, [['B-2', [1]]]);
  assert.deepEqual(f.writes.payments, [], 'A-1 keeps other lines, so its payments stay');
  assert.deepEqual(f.audits, [
    {
      action: 'order.renumber',
      entityType: 'order',
      entityId: 1,
      before: { order_id: 'A-1' },
      after: { order_id: 'B-2' },
      extra: { account_source: 'ebay', external_line_id: 'L1' },
    },
  ]);
  assert.deepEqual(res.outcome.changedOrderIds, [1]);
});

test('payment requests follow an order that moves whole', async () => {
  const f = fakes({ outbound: [line(1, 'A-1', 'L1'), line(2, 'A-1', 'L2')], rowCounts: { 'A-1': 2 } });
  const res = await changeRecordOrderNumber({ targets: [out(1), out(2)], orderNumber: 'B-2' }, f.actor, f.deps);
  assert.ok(res.ok);
  assert.deepEqual(f.writes.payments, [[['A-1'], 'B-2']]);
});

test('both numbers holding an open payment request: 409', async () => {
  const f = fakes({ outbound: [line(1, 'A-1', 'L1')], rowCounts: { 'A-1': 1 }, openPayments: ['A-1', 'B-2'] });
  const res = await changeRecordOrderNumber({ targets: [out(1)], orderNumber: 'B-2' }, f.actor, f.deps);
  assert.equal(res.ok, false);
  assert.deepEqual(f.writes.rekey, []);
});

test('inbound: partial-order re-key refused; whole order renamed; Zoho refused', async () => {
  const inboundLine = (id: number, inboundOrderId: number | null, sourceType: string | null = 'ebay'): InboundLineRow => ({
    id,
    primaryShipmentId: null,
    linkedShipmentIds: [],
    inboundOrderId,
    sourceType,
    sourceOrderId: sourceType ? `S-${inboundOrderId}` : null,
  });
  const f = fakes({
    inbound: [inboundLine(10, 1), inboundLine(20, 2), inboundLine(21, 2), inboundLine(30, 3, 'zoho'), inboundLine(40, null, null)],
    inboundOrders: [
      { id: 1, sourceType: 'ebay', orderNumber: 'old-1', lineIds: [10, 11] },
      { id: 2, sourceType: 'ebay', orderNumber: 'old-2', lineIds: [20, 21] },
      { id: 3, sourceType: 'zoho', orderNumber: 'PO-3', lineIds: [30] },
    ],
  });
  const res = await changeRecordOrderNumber(
    { targets: [inn(10), inn(20), inn(21), inn(30), inn(40)], orderNumber: 'NEW' },
    f.actor,
    f.deps,
  );
  assert.ok(res.ok);
  assert.deepEqual(
    res.outcome.results.map((r) => [r.key, r.outcome]),
    [['in:10', 'refused'], ['in:20', 'done'], ['in:21', 'done'], ['in:30', 'refused'], ['in:40', 'refused']],
  );
  assert.match(res.outcome.results[0].reason ?? '', /all 2 lines/);
  assert.match(res.outcome.results[3].reason ?? '', /Zoho/);
  assert.deepEqual(f.writes.renames, [[2, 'NEW', 20]]);
  assert.deepEqual(res.outcome.changedReceivingLineIds, [20, 21]);
  assert.deepEqual(f.audits.map((a) => [a.action, a.entityId]), [['inbound_order.renumber', 20], ['inbound_order.renumber', 21]]);
});
