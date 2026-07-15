import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateThreadStatus,
  softDeleteThread,
  editThreadMessage,
  deleteThreadMessage,
  type ThreadsDeps,
} from './threads';
import { assignThread, unassignThread } from './thread-assignments';
import { linkThreadEntity, unlinkThreadEntity } from './thread-links';

const ORG = '00000000-0000-0000-0000-000000000009';

const THREAD_ROW = {
  id: 5, entity_type: 'ORDER', entity_id: 42, status: 'open', support_ticket_id: null,
  last_message_at: null, created_by: null, created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
};

/**
 * SQL-dispatching fake: `routes` maps a RegExp → a function returning {rows}.
 * First match wins; unmatched queries return {rows:[]}. Captures every query.
 */
function fakes(routes: Array<[RegExp, (params: readonly unknown[]) => { rows: any[] }]>) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (text: string, params: readonly unknown[] = []) => {
      calls.push({ sql: text, params });
      for (const [re, fn] of routes) if (re.test(text)) return fn(params);
      return { rows: [] };
    },
  };
  const deps: ThreadsDeps = {
    runQuery: (_org, fn) => fn(client as any),
    runTransaction: (_org, fn) => fn(client as any),
  };
  return { deps, calls };
}

// ─── updateThreadStatus ──────────────────────────────────────────────────────

test('updateThreadStatus: valid status updates and returns the row', async () => {
  const { deps } = fakes([[/UPDATE entity_threads/, () => ({ rows: [{ ...THREAD_ROW, status: 'resolved' }] })]]);
  const out = await updateThreadStatus({ orgId: ORG, threadId: 5, status: 'resolved' }, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.thread.status, 'resolved');
});

test('updateThreadStatus: unknown status → 400, no query', async () => {
  const { deps, calls } = fakes([]);
  // @ts-expect-error invalid status
  const out = await updateThreadStatus({ orgId: ORG, threadId: 5, status: 'archived' }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(calls.length, 0);
});

test('updateThreadStatus: missing thread → 404', async () => {
  const { deps } = fakes([[/UPDATE entity_threads/, () => ({ rows: [] })]]);
  const out = await updateThreadStatus({ orgId: ORG, threadId: 5, status: 'open' }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
});

// ─── softDeleteThread ────────────────────────────────────────────────────────

test('softDeleteThread: live thread → tombstoned (not idempotent)', async () => {
  const { deps } = fakes([[/UPDATE entity_threads\s+SET deleted_at/, () => ({ rows: [{ id: 5 }] })]]);
  const out = await softDeleteThread(ORG, 5, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.idempotent, false);
});

test('softDeleteThread: already-deleted thread → idempotent true', async () => {
  const { deps } = fakes([
    [/UPDATE entity_threads\s+SET deleted_at/, () => ({ rows: [] })],
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [{ '?column?': 1 }] })],
  ]);
  const out = await softDeleteThread(ORG, 5, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.idempotent, true);
});

test('softDeleteThread: absent thread → 404', async () => {
  const { deps } = fakes([
    [/UPDATE entity_threads\s+SET deleted_at/, () => ({ rows: [] })],
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [] })],
  ]);
  const out = await softDeleteThread(ORG, 5, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
});

// ─── editThreadMessage ───────────────────────────────────────────────────────

test('editThreadMessage: author edits own message', async () => {
  const { deps } = fakes([
    [/SELECT author_staff_id, provider FROM thread_messages/, () => ({ rows: [{ author_staff_id: 7, provider: 'internal' }] })],
    [/UPDATE thread_messages/, () => ({ rows: [{ id: 1, thread_id: 5, author_staff_id: 7, provider: 'internal', visibility: 'internal', body: 'new', client_event_id: null, meta: null, created_at: '2026-07-15T00:00:00Z' }] })],
  ]);
  const out = await editThreadMessage({ orgId: ORG, threadId: 5, messageId: 1, body: 'new', actorStaffId: 7 }, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.message.body, 'new');
});

test('editThreadMessage: non-author without manage → 403', async () => {
  const { deps } = fakes([
    [/SELECT author_staff_id, provider FROM thread_messages/, () => ({ rows: [{ author_staff_id: 7, provider: 'internal' }] })],
  ]);
  const out = await editThreadMessage({ orgId: ORG, threadId: 5, messageId: 1, body: 'x', actorStaffId: 99, canManageAll: false }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 403);
});

test('editThreadMessage: manager edits any message (canManageAll)', async () => {
  const { deps } = fakes([
    [/SELECT author_staff_id, provider FROM thread_messages/, () => ({ rows: [{ author_staff_id: 7, provider: 'internal' }] })],
    [/UPDATE thread_messages/, () => ({ rows: [{ id: 1, thread_id: 5, author_staff_id: 7, provider: 'internal', visibility: 'internal', body: 'moderated', client_event_id: null, meta: null, created_at: '2026-07-15T00:00:00Z' }] })],
  ]);
  const out = await editThreadMessage({ orgId: ORG, threadId: 5, messageId: 1, body: 'moderated', actorStaffId: 99, canManageAll: true }, deps);
  assert.equal(out.ok, true);
});

test('editThreadMessage: empty body → 400', async () => {
  const { deps, calls } = fakes([]);
  const out = await editThreadMessage({ orgId: ORG, threadId: 5, messageId: 1, body: '   ' }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(calls.length, 0);
});

test('deleteThreadMessage: already-deleted → idempotent', async () => {
  const { deps } = fakes([
    [/SELECT author_staff_id, deleted_at FROM thread_messages/, () => ({ rows: [{ author_staff_id: 7, deleted_at: '2026-07-15T00:00:00Z' }] })],
  ]);
  const out = await deleteThreadMessage({ orgId: ORG, threadId: 5, messageId: 1, canManageAll: true }, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.idempotent, true);
});

// ─── assignThread ────────────────────────────────────────────────────────────

test('assignThread: first assignment (not a reassign)', async () => {
  const { deps } = fakes([
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT 1 FROM staff/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT assigned_staff_id FROM thread_assignments/, () => ({ rows: [] })],
    [/INSERT INTO thread_assignments/, () => ({ rows: [{ thread_id: 5, assigned_staff_id: 3, assigned_by: 1, created_at: 'x', updated_at: 'x' }] })],
  ]);
  const out = await assignThread({ orgId: ORG, threadId: 5, assignedStaffId: 3, assignedBy: 1 }, deps);
  assert.equal(out.ok, true);
  if (out.ok) { assert.equal(out.reassigned, false); assert.equal(out.previousStaffId, null); }
});

test('assignThread: reassign detects previous owner', async () => {
  const { deps } = fakes([
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT 1 FROM staff/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT assigned_staff_id FROM thread_assignments/, () => ({ rows: [{ assigned_staff_id: 8 }] })],
    [/INSERT INTO thread_assignments/, () => ({ rows: [{ thread_id: 5, assigned_staff_id: 3, assigned_by: 1, created_at: 'x', updated_at: 'x' }] })],
  ]);
  const out = await assignThread({ orgId: ORG, threadId: 5, assignedStaffId: 3, assignedBy: 1 }, deps);
  assert.equal(out.ok, true);
  if (out.ok) { assert.equal(out.reassigned, true); assert.equal(out.previousStaffId, 8); }
});

test('assignThread: missing thread → 404 (staff never checked)', async () => {
  const { deps } = fakes([[/SELECT 1 FROM entity_threads/, () => ({ rows: [] })]]);
  const out = await assignThread({ orgId: ORG, threadId: 5, assignedStaffId: 3 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
});

test('unassignThread: no row → idempotent', async () => {
  const { deps } = fakes([[/DELETE FROM thread_assignments/, () => ({ rows: [] })]]);
  const out = await unassignThread(ORG, 5, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.idempotent, true);
});

// ─── linkThreadEntity ────────────────────────────────────────────────────────

test('linkThreadEntity: valid link to an existing order', async () => {
  const { deps, calls } = fakes([
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT 1 FROM orders/, () => ({ rows: [{ '?column?': 1 }] })],
    [/INSERT INTO thread_links/, () => ({ rows: [{ id: 11, thread_id: 5, entity_type: 'ORDER', entity_id: 42, link_role: 'related', created_by: null, created_at: 'x', inserted: true }] })],
  ]);
  const out = await linkThreadEntity({ orgId: ORG, threadId: 5, entityType: 'ORDER', entityId: 42 }, deps);
  assert.equal(out.ok, true);
  if (out.ok) { assert.equal(out.created, true); assert.equal(out.link.entityType, 'ORDER'); }
  // parent validation queried the orders table (the registry parentTable), org-scoped
  assert.ok(calls.some((c) => /SELECT 1 FROM orders/.test(c.sql)));
});

test('linkThreadEntity: SKU validates against sku_catalog', async () => {
  const { deps, calls } = fakes([
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT 1 FROM sku_catalog/, () => ({ rows: [{ '?column?': 1 }] })],
    [/INSERT INTO thread_links/, () => ({ rows: [{ id: 12, thread_id: 5, entity_type: 'SKU', entity_id: 900, link_role: 'sku', created_by: null, created_at: 'x', inserted: true }] })],
  ]);
  const out = await linkThreadEntity({ orgId: ORG, threadId: 5, entityType: 'SKU', entityId: 900, linkRole: 'sku' }, deps);
  assert.equal(out.ok, true);
  assert.ok(calls.some((c) => /SELECT 1 FROM sku_catalog/.test(c.sql)));
});

test('linkThreadEntity: unknown entity type → 400, no DB touch', async () => {
  const { deps, calls } = fakes([]);
  // @ts-expect-error invalid type
  const out = await linkThreadEntity({ orgId: ORG, threadId: 5, entityType: 'TRACKING', entityId: 1 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(calls.length, 0);
});

test('linkThreadEntity: target entity absent → 404', async () => {
  const { deps } = fakes([
    [/SELECT 1 FROM entity_threads/, () => ({ rows: [{ '?column?': 1 }] })],
    [/SELECT 1 FROM orders/, () => ({ rows: [] })],
  ]);
  const out = await linkThreadEntity({ orgId: ORG, threadId: 5, entityType: 'ORDER', entityId: 999 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
});

test('unlinkThreadEntity: no row → idempotent', async () => {
  const { deps } = fakes([[/DELETE FROM thread_links/, () => ({ rows: [] })]]);
  const out = await unlinkThreadEntity(ORG, 5, 11, deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.idempotent, true);
});
