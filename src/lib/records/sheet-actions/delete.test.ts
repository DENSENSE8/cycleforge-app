import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteRecordLines, type RecordDeleteDeps } from './delete';
import type { InboundDeleteCandidate, OutboundDeleteCandidate } from './repo';
import type { RecordAuditEntry, RecordWriteActor, Tx } from './types';
import { OrderDeleteBlockedError } from '@/lib/neon/orders-queries';

const ORG = '00000000-0000-0000-0000-0000000000aa';

function fakes(outbound: OutboundDeleteCandidate[], inbound: InboundDeleteCandidate[], blockedIds: number[] = []) {
  const deleted = { orders: [] as number[], inbound: [] as Array<{ lines: number[]; cartons: number[]; orders: number[] }> };
  const audits: RecordAuditEntry[] = [];
  const deps: RecordDeleteDeps = {
    runInTx: async (orgId, fn) => {
      assert.equal(orgId, ORG);
      return fn({} as Tx);
    },
    loadOutboundDeleteCandidates: async (_tx, _org, ids) => outbound.filter((c) => ids.includes(c.id)),
    deleteOutboundLine: async (_tx, orgId, id, staffId) => {
      assert.equal(orgId, ORG);
      assert.equal(staffId, 5);
      if (blockedIds.includes(id)) throw new OrderDeleteBlockedError('This order has a shipping-label ingestion link.');
      deleted.orders.push(id);
      return true;
    },
    loadInboundDeleteCandidates: async (_tx, _org, ids) => inbound.filter((c) => ids.includes(c.id)),
    deleteInboundLines: async (_tx, _org, lines, cartons, orders) => {
      deleted.inbound.push({ lines: [...lines], cartons: [...cartons], orders: [...orders] });
      return { deletedCartonIds: [...cartons], deletedInboundOrderIds: [] };
    },
  };
  const actor: RecordWriteActor = { orgId: ORG, staffId: 5, audit: async (_tx, e) => void audits.push(e) };
  return { deps, actor, deleted, audits };
}

const outCand = (id: number, blocker: OutboundDeleteCandidate['blocker'] = null): OutboundDeleteCandidate => ({
  id,
  blocker,
  snapshot: { id, order_id: `O-${id}` },
});
const inCand = (id: number, blocker: string | null = null, cartonId: number | null = 70, inboundOrderId: number | null = 8): InboundDeleteCandidate => ({
  id,
  blocker,
  cartonId,
  inboundOrderId,
  snapshot: { id },
});

test('outbound: a scanned-out / packed / picked / labelled line is refused with "use Remove from list"', async () => {
  const f = fakes([outCand(1, 'scanned_out'), outCand(2, 'packed'), outCand(3, 'picked'), outCand(4, 'label_applied'), outCand(5)], []);
  const res = await deleteRecordLines(
    { targets: [1, 2, 3, 4, 5].map((id) => ({ direction: 'outbound' as const, id })) },
    f.actor,
    f.deps,
  );
  assert.deepEqual(res.results, [
    { key: 'out:1', outcome: 'refused', reason: 'Scanned out — use Remove from list' },
    { key: 'out:2', outcome: 'refused', reason: 'Packed — use Remove from list' },
    { key: 'out:3', outcome: 'refused', reason: 'Picked — use Remove from list' },
    { key: 'out:4', outcome: 'refused', reason: 'Label applied — use Remove from list' },
    { key: 'out:5', outcome: 'done' },
  ]);
  assert.deepEqual(f.deleted.orders, [5], 'only the untouched line goes through deleteOrder');
  assert.deepEqual(res.changedOrderIds, [5]);
  assert.deepEqual(f.audits, [
    { action: 'orders.delete', entityType: 'order', entityId: 5, before: { id: 5, order_id: 'O-5' }, after: null },
  ]);
});

test("outbound: deleteOrder's own refusal becomes that line's reason; the rest proceed", async () => {
  const f = fakes([outCand(1), outCand(2)], [], [1]);
  const res = await deleteRecordLines(
    { targets: [{ direction: 'outbound', id: 1 }, { direction: 'outbound', id: 2 }] },
    f.actor,
    f.deps,
  );
  assert.deepEqual(res.results.map((r) => r.outcome), ['refused', 'done']);
  assert.match(res.results[0].reason ?? '', /label ingestion/);
  assert.deepEqual(f.deleted.orders, [2]);
});

test('inbound: blocked lines refused; the rest deleted together with their cartons and orders named', async () => {
  const f = fakes([], [inCand(10, 'already scanned at the door'), inCand(11, null, 70, 8), inCand(12, null, 71, null)]);
  const res = await deleteRecordLines(
    { targets: [10, 11, 12, 404].map((id) => ({ direction: 'inbound' as const, id })) },
    f.actor,
    f.deps,
  );
  assert.deepEqual(res.results.map((r) => [r.key, r.outcome, r.reason]), [
    ['in:10', 'refused', 'Already scanned at the door — use Remove from list'],
    ['in:11', 'done', undefined],
    ['in:12', 'done', undefined],
    ['in:404', 'refused', 'Not found — it may have been deleted'],
  ]);
  assert.deepEqual(f.deleted.inbound, [{ lines: [11, 12], cartons: [70, 71], orders: [8] }]);
  assert.deepEqual(res.changedReceivingLineIds, [11, 12]);
  assert.deepEqual(f.audits.map((a) => [a.action, a.entityId]), [['receiving_line.delete', 11], ['receiving_line.delete', 12]]);
});

test('nothing deletable → no inbound delete call', async () => {
  const f = fakes([], [inCand(10, 'units attached')]);
  await deleteRecordLines({ targets: [{ direction: 'inbound', id: 10 }] }, f.actor, f.deps);
  assert.deepEqual(f.deleted.inbound, []);
});
