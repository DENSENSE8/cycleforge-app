import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecordAction, type RecordActionDeps } from './actions';
import type { RecordAuditEntry, RecordWriteActor, Tx } from './types';

const ORG = '00000000-0000-0000-0000-0000000000aa';
const out = (id: number) => ({ direction: 'outbound' as const, id });
const inn = (id: number) => ({ direction: 'inbound' as const, id });

function fakes(state: { orders: number[]; flags?: Record<number, 'hold' | 'priority' | null>; staffOk?: boolean }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const audits: RecordAuditEntry[] = [];
  const known = (ids: readonly number[]) => ids.filter((id) => state.orders.includes(id));
  const deps: RecordActionDeps = {
    runInTx: async (orgId, fn) => {
      assert.equal(orgId, ORG);
      return fn({} as Tx);
    },
    addOrderNotes: async (_tx, _org, ids, text, staffId) => {
      calls.push(['addOrderNotes', [...ids], text, staffId]);
      return known(ids).map((id) => ({ id, before: null }));
    },
    appendInboundNotes: async (_tx, _org, ids, text) => {
      calls.push(['appendInboundNotes', [...ids], text]);
      return ids.map((id) => ({ id, before: 'old', after: `old\n${text}` }));
    },
    orderShipBy: async (_tx, _org, ids) => new Map(known(ids).map((id) => [id, id === 1 ? '2026-10-10' : null])),
    setOrderShipBy: async (_tx, _org, ids, date) => void calls.push(['setOrderShipBy', [...ids], date]),
    orderAssignees: async (_tx, _org, ids, stage) => new Map(known(ids).map((id) => [id, stage === 'PICK' ? 9 : null])),
    assignOrders: async (_tx, _org, ids, stage, staffId) => void calls.push(['assignOrders', [...ids], stage, staffId]),
    activeStaffExists: async () => state.staffOk ?? true,
    orderFlags: async (_tx, _org, ids) => new Map(known(ids).map((id) => [id, state.flags?.[id] ?? null])),
    setOrderFlags: async (_tx, _org, ids, flag, staffId) => void calls.push(['setOrderFlags', [...ids], flag, staffId]),
  };
  const actor: RecordWriteActor = { orgId: ORG, staffId: 4, audit: async (_tx, e) => void audits.push(e) };
  return { deps, actor, calls, audits };
}

test('outbound-only verbs refuse inbound lines with a reason and never write them', async () => {
  for (const body of [
    { action: 'ship_by' as const, targets: [out(1), inn(5)], date: '2026-10-12' },
    { action: 'assign' as const, targets: [out(1), inn(5)], stage: 'pick' as const, staffId: 2 },
    { action: 'hold' as const, targets: [out(1), inn(5)], on: true },
  ]) {
    const f = fakes({ orders: [1] });
    const res = await runRecordAction(body, f.actor, f.deps);
    assert.equal(res.results[0].outcome, 'done', body.action);
    assert.equal(res.results[1].outcome, 'refused', body.action);
    assert.match(res.results[1].reason ?? '', /outbound lines only/);
    assert.deepEqual(res.changedReceivingLineIds, []);
  }
});

test('note lands on both directions, audited per line', async () => {
  const f = fakes({ orders: [1] });
  const res = await runRecordAction({ action: 'note', targets: [out(1), inn(5), out(404)], text: 'box crushed' }, f.actor, f.deps);
  assert.deepEqual(res.results.map((r) => r.outcome), ['done', 'done', 'refused']);
  assert.deepEqual(f.calls, [
    ['addOrderNotes', [1, 404], 'box crushed', 4],
    ['appendInboundNotes', [5], 'box crushed'],
  ]);
  assert.deepEqual(f.audits.map((a) => [a.action, a.entityType, a.entityId]), [
    ['orders.update', 'order', 1],
    ['receiving_line.note.add', 'receiving_line', 5],
  ]);
});

test('ship_by writes only lines whose ship-by changes', async () => {
  const f = fakes({ orders: [1, 2] });
  const res = await runRecordAction({ action: 'ship_by', targets: [out(1), out(2)], date: '2026-10-10' }, f.actor, f.deps);
  assert.deepEqual(f.calls, [['setOrderShipBy', [2], '2026-10-10']]);
  assert.deepEqual(res.changedOrderIds, [2]);
  assert.deepEqual(f.audits[0].before, { ship_by: null });
});

test('assign maps the stage onto the desk work type; unknown staff refuses the lines', async () => {
  const f = fakes({ orders: [1] });
  await runRecordAction({ action: 'assign', targets: [out(1)], stage: 'pack', staffId: 2 }, f.actor, f.deps);
  assert.deepEqual(f.calls, [['assignOrders', [1], 'PACK', 2]]);
  assert.equal(f.audits[0].action, 'ORDER_ASSIGNMENT_UPDATED');
  assert.deepEqual(f.audits[0].after, { packer_id: 2 });

  const bad = fakes({ orders: [1], staffOk: false });
  const res = await runRecordAction({ action: 'assign', targets: [out(1)], stage: 'pick', staffId: 77 }, bad.actor, bad.deps);
  assert.equal(res.results[0].outcome, 'refused');
  assert.deepEqual(bad.calls, []);
});

test('release clears only a Hold flag, never another flag', async () => {
  const f = fakes({ orders: [1, 2, 3], flags: { 1: 'hold', 2: 'priority', 3: null } });
  const res = await runRecordAction({ action: 'hold', targets: [out(1), out(2), out(3)], on: false }, f.actor, f.deps);
  assert.deepEqual(f.calls, [['setOrderFlags', [1], null, 4]]);
  assert.deepEqual(res.changedOrderIds, [1]);
  assert.deepEqual(res.results.map((r) => r.outcome), ['done', 'done', 'done']);

  const on = fakes({ orders: [1, 2], flags: { 1: 'hold', 2: null } });
  await runRecordAction({ action: 'hold', targets: [out(1), out(2)], on: true }, on.actor, on.deps);
  assert.deepEqual(on.calls, [['setOrderFlags', [2], 'hold', 4]]);
});
