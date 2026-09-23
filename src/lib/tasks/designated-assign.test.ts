/**
 * The ingestion pass over fake storage: assigns once, never twice, refuses to
 * guess, and leaves untagged tickets alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runDesignatedAssign,
  type DesignatedAssignDeps,
  type DesignatedTicket,
} from './designated-assign';
import type { DesignatedStaff } from './designated-tag';

const ORG = '00000000-0000-0000-0000-000000000001';

const STAFF: DesignatedStaff[] = [
  { id: 1, name: 'Michael', email: null },
  { id: 2, name: 'Thuc', email: null },
];

function ticket(overrides: Partial<DesignatedTicket> = {}): DesignatedTicket {
  return {
    providerTicketId: 48120,
    subject: 'Amp arrived with a bent pin',
    status: 'open',
    tags: ['designated_michael'],
    ...overrides,
  };
}

/**
 * Fake registry + task store. `openTasks` is the stored dedupe predicate: the
 * fake createTask writes into it, exactly as the real one commits a row the
 * next pass's `hasOpenTask` will see.
 */
function fakes(
  tickets: DesignatedTicket[],
  opts: { staff?: DesignatedStaff[]; refuseCreate?: boolean; unresolvable?: boolean } = {},
) {
  const created: Array<{ supportTicketId: number; assigneeStaffId: number; note: string | null }> =
    [];
  const openTasks = new Set<number>();
  const resolved: number[] = [];

  const deps: DesignatedAssignDeps = {
    async listStaff() {
      return opts.staff ?? STAFF;
    },
    async listTickets() {
      return tickets;
    },
    async resolveSupportTicketId(t) {
      resolved.push(t.providerTicketId);
      // Local registry id ≠ provider number, which is the whole point of the
      // translation — the assertions below name the LOCAL one.
      return opts.unresolvable ? null : t.providerTicketId - 48000;
    },
    async hasOpenTask(supportTicketId) {
      return openTasks.has(supportTicketId);
    },
    async createTask(args) {
      if (opts.refuseCreate) return false;
      created.push(args);
      openTasks.add(args.supportTicketId);
      return true;
    },
  };

  return { deps, created, resolved, openTasks };
}

test('a designated ticket becomes one task on the named staffer, anchored to the LOCAL id', async () => {
  const f = fakes([ticket()]);

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 1, assigned: 1, skipped: 0, ambiguous: 0 });
  assert.deepEqual(f.created, [
    { supportTicketId: 120, assigneeStaffId: 1, note: 'Amp arrived with a bent pin' },
  ]);
});

test('the second run over the same ticket assigns nothing', async () => {
  const f = fakes([ticket()]);

  await runDesignatedAssign(ORG, f.deps);
  const second = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(second, { scanned: 1, assigned: 0, skipped: 1, ambiguous: 0 });
  assert.equal(f.created.length, 1);
});

test('two provider tickets mirroring one registry row still produce one task', async () => {
  const f = fakes([ticket(), ticket({ providerTicketId: 48120 })]);

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 2, assigned: 1, skipped: 1, ambiguous: 0 });
  assert.equal(f.created.length, 1);
});

test('an ambiguous designation is counted, skipped, and never resolved', async () => {
  const f = fakes([ticket()], { staff: [...STAFF, { id: 44, name: 'Michael Chen', email: null }] });

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 1, assigned: 0, skipped: 1, ambiguous: 1 });
  assert.deepEqual(f.created, []);
  // Refused before the translation — an unanswerable tag must not mint a mirror.
  assert.deepEqual(f.resolved, []);
});

test('an untagged ticket is scanned and otherwise untouched', async () => {
  const f = fakes([ticket({ tags: ['walk_in', 'repair_service'] })]);

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 1, assigned: 0, skipped: 0, ambiguous: 0 });
  assert.deepEqual(f.created, []);
  assert.deepEqual(f.resolved, []);
});

test('a ticket whose subject is blank yields a task with no note, not an empty one', async () => {
  const f = fakes([ticket({ subject: '   ' })]);

  await runDesignatedAssign(ORG, f.deps);

  assert.equal(f.created[0]?.note, null);
});

test('an untranslatable ticket is skipped, not assigned to the wrong anchor', async () => {
  const f = fakes([ticket()], { unresolvable: true });

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 1, assigned: 0, skipped: 1, ambiguous: 0 });
  assert.deepEqual(f.created, []);
});

test('a refused throw is reported as skipped, never as assigned', async () => {
  const f = fakes([ticket()], { refuseCreate: true });

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 1, assigned: 0, skipped: 1, ambiguous: 0 });
});

test('a cancelled task makes the ticket assignable again', async () => {
  const f = fakes([ticket()]);
  await runDesignatedAssign(ORG, f.deps);

  // What CANCELED means downstream: the predicate stops matching.
  f.openTasks.clear();
  const second = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(second, { scanned: 1, assigned: 1, skipped: 0, ambiguous: 0 });
  assert.equal(f.created.length, 2);
});

test('an empty scan window touches neither the roster nor the store', async () => {
  const f = fakes([]);

  const summary = await runDesignatedAssign(ORG, f.deps);

  assert.deepEqual(summary, { scanned: 0, assigned: 0, skipped: 0, ambiguous: 0 });
  assert.deepEqual(f.resolved, []);
});
