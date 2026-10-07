import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecordTracking, unlinkRecordTracking, type RecordTrackingDeps } from './tracking';
import type { RecordAuditEntry, RecordWriteActor, Tx } from './types';
import type { RecordTarget } from '@/lib/records/sheet-actions-contract';

const ORG = '00000000-0000-0000-0000-0000000000aa';

interface Line {
  orderNumber: string;
  accountSource: string;
  primary: number | null;
  linked: number[];
}

/** An in-memory world the fake deps read and mutate, so sequential requests compose. */
function world(opts: {
  outbound?: Record<number, Line>;
  inbound?: Record<number, { primary: number | null; linked: number[] }>;
  shipments?: Record<string, number | null>;
}) {
  const outbound = opts.outbound ?? {};
  const inbound = opts.inbound ?? {};
  const shipments = opts.shipments ?? {};
  const calls = { link: [] as Array<[string, number, boolean]>, unlink: [] as Array<[string, number]>, orgs: [] as string[] };
  const audits: RecordAuditEntry[] = [];
  const lineOf = (t: RecordTarget) => (t.direction === 'outbound' ? outbound[t.id] : inbound[t.id]);

  const deps: RecordTrackingDeps = {
    runInTx: async (orgId, fn) => {
      calls.orgs.push(orgId);
      return fn({} as Tx);
    },
    registerTracking: async (tracking, orgId) => {
      calls.orgs.push(orgId);
      return tracking in shipments ? shipments[tracking] : null;
    },
    loadOutboundLines: async (_tx, orgId, ids) => {
      calls.orgs.push(orgId);
      return ids.filter((id) => outbound[id]).map((id) => ({
        id,
        orderNumber: outbound[id].orderNumber,
        accountSource: outbound[id].accountSource,
        externalLineId: null,
        platformLabel: null,
        primaryShipmentId: outbound[id].primary,
        linkedShipmentIds: [...outbound[id].linked],
      }));
    },
    loadInboundLines: async (_tx, _orgId, ids) =>
      ids.filter((id) => inbound[id]).map((id) => ({
        id,
        primaryShipmentId: inbound[id].primary,
        linkedShipmentIds: [...inbound[id].linked],
        inboundOrderId: null,
        sourceType: null,
        sourceOrderId: null,
      })),
    shipmentOrderOwners: async (_tx, _orgId, sid) =>
      Object.entries(outbound)
        .filter(([, l]) => l.primary === sid || l.linked.includes(sid))
        .map(([id, l]) => ({ id: Number(id), orderNumber: l.orderNumber, accountSource: l.accountSource })),
    linkLineTracking: async (_tx, orgId, target, sid, primary) => {
      calls.orgs.push(orgId);
      calls.link.push([`${target.direction}:${target.id}`, sid, primary]);
      const line = lineOf(target);
      if (!line.linked.includes(sid)) line.linked.push(sid);
      if (primary) line.primary = sid;
    },
    unlinkLineTracking: async (_tx, _orgId, target, sid) => {
      calls.unlink.push([`${target.direction}:${target.id}`, sid]);
      const line = lineOf(target);
      line.linked = line.linked.filter((s) => s !== sid);
      if (line.primary === sid) line.primary = null;
    },
  };
  const actor: RecordWriteActor = {
    orgId: ORG,
    staffId: 7,
    audit: async (_tx, entry) => {
      audits.push(entry);
    },
  };
  return { deps, actor, calls, audits, outbound, inbound };
}

const out = (id: number): RecordTarget => ({ direction: 'outbound', id });
const inn = (id: number): RecordTarget => ({ direction: 'inbound', id });
const order = (primary: number | null = null): Line => ({
  orderNumber: '111-1',
  accountSource: 'ebay',
  primary,
  linked: primary == null ? [] : [primary],
});

test('partial grain: lines 1–2 → A then line 3 → B touches only the named lines', async () => {
  const w = world({ outbound: { 1: order(), 2: order(), 3: order() }, shipments: { A: 100, B: 200 } });

  const first = await applyRecordTracking({ targets: [out(1), out(2)], tracking: 'A', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(first.results.map((r) => r.outcome), ['done', 'done']);
  assert.deepEqual(w.calls.link, [['outbound:1', 100, true], ['outbound:2', 100, true]]);
  assert.equal(w.outbound[3].primary, null, 'line 3 untouched by the first request');

  const second = await applyRecordTracking({ targets: [out(3)], tracking: 'B', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(second.results, [{ key: 'out:3', outcome: 'done' }]);
  assert.deepEqual(second.changedOrderIds, [3]);
  assert.equal(w.outbound[1].primary, 100);
  assert.equal(w.outbound[2].primary, 100);
  assert.equal(w.outbound[3].primary, 200);
  assert.deepEqual(w.calls.unlink, [], 'no line had a primary to unlink');
  assert.ok(w.calls.orgs.every((o) => o === ORG), 'org threaded into every collaborator');
});

test('set replaces the primary on the named line only and unlinks the old one from it', async () => {
  const w = world({ outbound: { 1: order(100), 2: order(100) }, shipments: { B: 200 } });
  await applyRecordTracking({ targets: [out(1)], tracking: 'B', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(w.calls.unlink, [['outbound:1', 100]]);
  assert.deepEqual(w.calls.link, [['outbound:1', 200, true]]);
  assert.deepEqual(w.outbound[1], { ...order(), primary: 200, linked: [200] });
  assert.deepEqual(w.outbound[2], order(100), 'the sibling keeps the old tracking');
  assert.equal(w.audits.length, 1);
  assert.equal(w.audits[0].action, 'orders.tracking.replaced');
  assert.deepEqual(w.audits[0].before, { shipment_id: 100, shipment_ids: [100] });
  assert.deepEqual(w.audits[0].after, { shipment_id: 200, shipment_ids: [200] });
});

test('add links another box beside the primary; a line with none gets it as primary', async () => {
  const w = world({ outbound: { 1: order(100), 2: order() }, shipments: { C: 300 } });
  await applyRecordTracking({ targets: [out(1), out(2)], tracking: 'C', mode: 'add' }, w.actor, w.deps);
  assert.deepEqual(w.calls.link, [['outbound:1', 300, false], ['outbound:2', 300, true]]);
  assert.deepEqual(w.calls.unlink, [], 'add never unlinks');
  assert.equal(w.outbound[1].primary, 100);
  assert.deepEqual(w.outbound[1].linked, [100, 300]);
  assert.equal(w.outbound[2].primary, 300);
  assert.deepEqual(w.audits.map((a) => a.action), ['orders.tracking.added', 'orders.tracking.added']);
});

test('re-sending the same set / add is a no-op (no writes, no audit)', async () => {
  const w = world({ outbound: { 1: order(100) }, inbound: { 5: { primary: 100, linked: [100] } }, shipments: { A: 100 } });
  const set = await applyRecordTracking({ targets: [out(1), inn(5)], tracking: 'A', mode: 'set' }, w.actor, w.deps);
  const add = await applyRecordTracking({ targets: [out(1), inn(5)], tracking: 'A', mode: 'add' }, w.actor, w.deps);
  assert.deepEqual([...set.results, ...add.results].map((r) => r.outcome), ['done', 'done', 'done', 'done']);
  assert.deepEqual(w.calls.link, []);
  assert.deepEqual(w.audits, []);
  assert.deepEqual(set.changedOrderIds, []);
});

test('inbound set re-points the line (never the carton) and audits the receiving line', async () => {
  const w = world({ inbound: { 5: { primary: 100, linked: [100] }, 6: { primary: 100, linked: [100] } }, shipments: { B: 200 } });
  const res = await applyRecordTracking({ targets: [inn(5)], tracking: 'B', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(res.results, [{ key: 'in:5', outcome: 'done' }]);
  assert.deepEqual(res.changedReceivingLineIds, [5]);
  assert.deepEqual(w.calls.unlink, [['inbound:5', 100]]);
  assert.deepEqual(w.calls.link, [['inbound:5', 200, true]]);
  assert.equal(w.inbound[6].primary, 100);
  assert.equal(w.audits[0].action, 'receiving_line.tracking.set');
  assert.equal(w.audits[0].entityType, 'receiving_line');
});

test('outbound: a tracking already shipping another, un-named order is refused on that line', async () => {
  const w = world({
    outbound: { 1: order(), 9: { orderNumber: '999-9', accountSource: 'ebay', primary: 100, linked: [100] } },
    shipments: { A: 100 },
  });
  const res = await applyRecordTracking({ targets: [out(1)], tracking: 'A', mode: 'set' }, w.actor, w.deps);
  assert.equal(res.results[0].outcome, 'refused');
  assert.match(res.results[0].reason ?? '', /already ships order 999-9/);
  assert.deepEqual(w.calls.link, []);

  // Naming the other order's line too is an explicit shared box: allowed.
  const both = await applyRecordTracking({ targets: [out(1), out(9)], tracking: 'A', mode: 'add' }, w.actor, w.deps);
  assert.deepEqual(both.results.map((r) => r.outcome), ['done', 'done']);
});

test('a sibling line of the same order may share the tracking', async () => {
  const w = world({ outbound: { 1: order(100), 2: order() }, shipments: { A: 100 } });
  const res = await applyRecordTracking({ targets: [out(2)], tracking: 'A', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(res.results, [{ key: 'out:2', outcome: 'done' }]);
});

test('not a tracking number → every line refused, no transaction', async () => {
  const w = world({ outbound: { 1: order() } });
  const res = await applyRecordTracking({ targets: [out(1), inn(4)], tracking: 'NOPE', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(res.results.map((r) => r.outcome), ['refused', 'refused']);
  assert.deepEqual(w.calls.link, []);
});

test('a line not in the org answers refused, the others proceed', async () => {
  const w = world({ outbound: { 1: order() }, shipments: { A: 100 } });
  const res = await applyRecordTracking({ targets: [out(1), out(404)], tracking: 'A', mode: 'set' }, w.actor, w.deps);
  assert.deepEqual(res.results.map((r) => r.outcome), ['done', 'refused']);
});

test('unlink removes the link from the named lines only; refuses a line without it', async () => {
  const w = world({
    outbound: { 1: order(100), 2: order(100), 3: { ...order(200), linked: [200] } },
  });
  const res = await unlinkRecordTracking({ targets: [out(1), out(3)], shipmentId: 100 }, w.actor, w.deps);
  assert.deepEqual(res.results.map((r) => r.outcome), ['done', 'refused']);
  assert.deepEqual(w.calls.unlink, [['outbound:1', 100]]);
  assert.equal(w.outbound[1].primary, null);
  assert.equal(w.outbound[2].primary, 100, 'the sibling keeps it');
  assert.equal(w.audits[0].action, 'orders.tracking.unlinked');
  assert.deepEqual(w.audits[0].after, { shipment_id: null, shipment_ids: [] });
});
