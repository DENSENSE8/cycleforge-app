import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskLink, mapTaskLinkRow, type NewTaskLinkRow, type RepairLinkRef, type TaskLinksDeps } from './task-links';

/** Repairs in the org: id → ticket number. Two share `48120`. */
const REPAIRS: ReadonlyArray<{ id: number; ticketNumber: string }> = [
  { id: 74, ticketNumber: '50111' },
  { id: 80, ticketNumber: '48120' },
  { id: 81, ticketNumber: '48120' },
];

function fakes() {
  const inserts: NewTaskLinkRow[] = [];
  const lookups: RepairLinkRef[] = [];
  const deps: TaskLinksDeps = {
    findTaskAnchor: async (taskId) => (taskId === 7 ? { entityType: null, entityId: null } : null),
    findOrder: async () => null,
    resolveTicket: async () => ({ ok: false, reason: 'not_found' }),
    findOrderIdByTracking: async () => null,
    findRepairIds: async (ref) => {
      lookups.push(ref);
      const hits =
        'repairId' in ref
          ? REPAIRS.filter((r) => r.id === ref.repairId)
          : REPAIRS.filter((r) => r.ticketNumber === ref.ticketNumber);
      return hits.slice(0, 2).map((r) => r.id);
    },
    insertLink: async (row) => {
      inserts.push(row);
      return true;
    },
    readLinks: async (taskId, key) =>
      inserts
        .filter((row) => row.taskId === taskId && (!key || (row.entityType === key.entityType && row.label === key.label)))
        .map((row, i) => ({
          id: i + 1,
          taskId,
          kind: 'repair' as const,
          entityId: row.entityId,
          label: row.label,
          createdAt: '2026-09-29T00:00:00.000Z',
          createdBy: null,
          order: null,
          tracking: null,
          ticket: null,
          repair: null,
        })),
    deleteLink: async () => null,
  };
  return { deps, inserts, lookups };
}

test('repair link: every RS- spelling names the repair row, stored as RS-<id>', async () => {
  for (const value of ['RS-74', 'rs74', 'RS 0074', 'RS#74']) {
    const { deps, inserts } = fakes();
    const result = await createTaskLink(7, 3, { kind: 'repair', value }, deps);
    assert.equal(result.ok, true, value);
    assert.deepEqual(
      inserts.map((row) => [row.entityType, row.entityId, row.label]),
      [['REPAIR', 74, 'RS-74']],
      value,
    );
  }
});

test('repair link: a bare or #-prefixed value is the ticket number, not the repair id', async () => {
  const { deps, inserts, lookups } = fakes();
  const result = await createTaskLink(7, 3, { kind: 'repair', value: '#50111' }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(lookups, [{ ticketNumber: '50111' }]);
  assert.equal(inserts[0]?.label, 'RS-74');

  const byIdShape = await createTaskLink(7, 3, { kind: 'repair', value: '74' }, fakes().deps);
  assert.deepEqual(byIdShape, { ok: false, reason: 'repair_not_found' });
});

test('repair link: a ticket number two repairs share refuses instead of guessing', async () => {
  const { deps, inserts } = fakes();
  const result = await createTaskLink(7, 3, { kind: 'repair', value: '48120' }, deps);
  assert.deepEqual(result, { ok: false, reason: 'repair_ambiguous' });
  assert.equal(inserts.length, 0);
});

test('repair link: an unknown repair or a blank value is repair_not_found', async () => {
  for (const value of ['RS-999', '   ', '#']) {
    const result = await createTaskLink(7, 3, { kind: 'repair', value }, fakes().deps);
    assert.deepEqual(result, { ok: false, reason: 'repair_not_found' }, JSON.stringify(value));
  }
});

test('mapTaskLinkRow: a REPAIR row carries the repair face; a deleted repair reads as null', () => {
  const base = {
    id: 5,
    assignment_id: 7,
    entity_type: 'REPAIR',
    entity_id: 74,
    label: 'RS-74',
    created_at: '2026-09-29T00:00:00.000Z',
  };
  const link = mapTaskLinkRow({
    ...base,
    repair_id: 74,
    repair_ticket_number: ' 50111 ',
    repair_status: 'Pending Repair',
    repair_title: 'Bose AM15',
  });
  assert.equal(link?.kind, 'repair');
  assert.deepEqual(link?.repair, { id: 74, ticketNumber: '50111', status: 'Pending Repair', title: 'Bose AM15' });
  assert.equal(link?.ticket, null);
  assert.equal(mapTaskLinkRow({ ...base, repair_id: null })?.repair, null);
});
