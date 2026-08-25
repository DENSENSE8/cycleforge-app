/**
 * DB-free unit tests for the entity-threads domain layer (house Deps pattern —
 * A scripted fake client answers by SQL
 * fragment; assertions cover BOTH the return value and what was threaded into
 * the deps (org scoping, idempotency, ops_events emission).
 *
 * Run: npx tsx --test src/lib/threads/threads.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachSupportTicket,
  getOrCreateThread,
  listThreadMessages,
  postEntityMessage,
  postThreadMessage,
  resolveThreadForEntity,
  type ThreadsDeps,
} from './threads';

const ORG = '00000000-0000-0000-0000-000000000001';

interface CapturedQuery {
  text: string;
  params: ReadonlyArray<unknown>;
}

interface Handler {
  match: RegExp;
  rows: Array<Record<string, unknown>> | ((params: ReadonlyArray<unknown>) => Array<Record<string, unknown>>);
}

interface Captured {
  queries: CapturedQuery[];
  transactions: string[]; // orgIds passed to runTransaction
  reads: string[]; // orgIds passed to runQuery
}

function fakes(handlers: Handler[]) {
  const cap: Captured = { queries: [], transactions: [], reads: [] };
  const client = {
    query: async (text: string, params: ReadonlyArray<unknown> = []) => {
      cap.queries.push({ text, params });
      for (const h of handlers) {
        if (h.match.test(text)) {
          return { rows: typeof h.rows === 'function' ? h.rows(params) : h.rows };
        }
      }
      return { rows: [] };
    },
  };
  const deps: ThreadsDeps = {
    runQuery: async (orgId, fn) => {
      cap.reads.push(orgId);
      return fn(client);
    },
    runTransaction: async (orgId, fn) => {
      cap.transactions.push(orgId);
      return fn(client);
    },
  };
  return { deps, cap };
}

const NOW = new Date('2026-07-14T18:00:00.000Z');

function threadRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    entity_type: 'RECEIVING',
    entity_id: 42,
    status: 'open',
    support_ticket_id: null,
    last_message_at: null,
    created_by: 5,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 100,
    thread_id: 7,
    author_staff_id: 5,
    provider: 'internal',
    visibility: 'internal',
    body: 'hello bench',
    client_event_id: 'ce-1',
    meta: null,
    created_at: NOW,
    ...overrides,
  };
}

// ─── resolveThreadForEntity ──────────────────────────────────────────────────

test('resolveThreadForEntity: returns mapped thread, org threaded into query', async () => {
  const { deps, cap } = fakes([{ match: /FROM entity_threads/, rows: [threadRow()] }]);
  const out = await resolveThreadForEntity({ orgId: ORG, entityType: 'RECEIVING', entityId: 42 }, deps);

  assert.ok(out);
  assert.equal(out.id, 7);
  assert.equal(out.entityType, 'RECEIVING');
  assert.equal(out.supportTicketId, null);
  assert.equal(cap.reads[0], ORG);
  assert.deepEqual(cap.queries[0].params, [ORG, 'RECEIVING', 42]);
});

test('resolveThreadForEntity: unknown entity_type short-circuits to null (no query)', async () => {
  const { deps, cap } = fakes([]);
  const out = await resolveThreadForEntity({ orgId: ORG, entityType: 'BOGUS', entityId: 1 }, deps);
  assert.equal(out, null);
  assert.equal(cap.queries.length, 0);
});

// ─── getOrCreateThread ───────────────────────────────────────────────────────

test('getOrCreateThread: validates parent (registry table), upserts, created=true on fresh insert', async () => {
  const { deps, cap } = fakes([
    { match: /FROM receiving WHERE/, rows: [{ '?column?': 1 }] },
    { match: /INSERT INTO entity_threads/, rows: [{ ...threadRow(), inserted: true }] },
  ]);
  const out = await getOrCreateThread({ orgId: ORG, entityType: 'RECEIVING', entityId: 42, createdBy: 5 }, deps);

  assert.ok(out.ok);
  assert.equal(out.created, true);
  assert.equal(out.thread.id, 7);
  assert.equal(cap.transactions[0], ORG);
  // Parent check hits the registry's parent table with org scoping.
  assert.match(cap.queries[0].text, /FROM receiving WHERE id = \$1 AND organization_id = \$2::uuid/);
  assert.deepEqual(cap.queries[0].params, [42, ORG]);
  // Upsert threads org + vocab + creator.
  assert.deepEqual(cap.queries[1].params, [ORG, 'RECEIVING', 42, 5]);
});

test('getOrCreateThread: existing thread returns created=false (xmax path)', async () => {
  const { deps } = fakes([
    { match: /FROM warranty_claims WHERE/, rows: [{ '?column?': 1 }] },
    { match: /INSERT INTO entity_threads/, rows: [{ ...threadRow({ entity_type: 'WARRANTY_CLAIM' }), inserted: false }] },
  ]);
  const out = await getOrCreateThread({ orgId: ORG, entityType: 'WARRANTY_CLAIM', entityId: 42 }, deps);
  assert.ok(out.ok);
  assert.equal(out.created, false);
});

test('getOrCreateThread: missing parent → 404, no INSERT attempted', async () => {
  const { deps, cap } = fakes([{ match: /FROM orders WHERE/, rows: [] }]);
  const out = await getOrCreateThread({ orgId: ORG, entityType: 'ORDER', entityId: 999 }, deps);

  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
  assert.equal(cap.queries.filter((q) => /INSERT/.test(q.text)).length, 0);
});

test('getOrCreateThread: unknown entity_type → 400 before any transaction', async () => {
  const { deps, cap } = fakes([]);
  const out = await getOrCreateThread({ orgId: ORG, entityType: 'sales_order', entityId: 1 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(cap.transactions.length, 0);
});

// ─── postThreadMessage ───────────────────────────────────────────────────────

test('postThreadMessage: inserts, bumps last_message_at, emits THREAD_MESSAGE ops_event (lowercase entity)', async () => {
  const { deps, cap } = fakes([
    { match: /SELECT id, entity_type, entity_id FROM entity_threads/, rows: [{ id: 7, entity_type: 'RECEIVING', entity_id: 42 }] },
    { match: /INSERT INTO thread_messages/, rows: [messageRow()] },
  ]);
  const out = await postThreadMessage(
    { orgId: ORG, threadId: 7, authorStaffId: 5, body: 'hello bench', clientEventId: 'ce-1' },
    deps,
  );

  assert.ok(out.ok);
  assert.equal(out.idempotent, false);
  assert.equal(out.message.id, 100);

  const update = cap.queries.find((q) => /UPDATE entity_threads/.test(q.text));
  assert.ok(update, 'last_message_at bump ran');
  assert.deepEqual(update.params, [7, NOW.toISOString(), ORG]);

  const ops = cap.queries.find((q) => /INSERT INTO ops_events/.test(q.text));
  assert.ok(ops, 'ops_events emission ran');
  assert.match(ops.text, /'THREAD_MESSAGE'/);
  // UPPERCASE anchor → lowercase spine vocab via the registry.
  assert.equal(ops.params[2], 'receiving');
  assert.equal(ops.params[3], 42);
  assert.equal(ops.params[5], 'thread-message:100');
  const payload = JSON.parse(String(ops.params[6]));
  assert.equal(payload.threadId, 7);
  assert.equal(payload.messageId, 100);
  assert.equal(payload.preview, 'hello bench');
});

test('postThreadMessage: clientEventId retry is a no-op — no bump, no ops_event', async () => {
  const { deps, cap } = fakes([
    { match: /SELECT id, entity_type, entity_id FROM entity_threads/, rows: [{ id: 7, entity_type: 'RECEIVING', entity_id: 42 }] },
    { match: /INSERT INTO thread_messages/, rows: [] }, // ON CONFLICT DO NOTHING hit
    { match: /SELECT .* FROM thread_messages\s+WHERE organization_id/s, rows: [messageRow()] },
  ]);
  const out = await postThreadMessage({ orgId: ORG, threadId: 7, body: 'hello bench', clientEventId: 'ce-1' }, deps);

  assert.ok(out.ok);
  assert.equal(out.idempotent, true);
  assert.equal(out.message.id, 100);
  assert.equal(cap.queries.filter((q) => /UPDATE entity_threads/.test(q.text)).length, 0);
  assert.equal(cap.queries.filter((q) => /ops_events/.test(q.text)).length, 0);
});

test('postThreadMessage: unknown thread → 404, no writes', async () => {
  const { deps, cap } = fakes([{ match: /SELECT id, entity_type, entity_id FROM entity_threads/, rows: [] }]);
  const out = await postThreadMessage({ orgId: ORG, threadId: 999, body: 'x' }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
  assert.equal(cap.queries.filter((q) => /INSERT/.test(q.text)).length, 0);
});

test('postThreadMessage: blank body → 400 before any transaction', async () => {
  const { deps, cap } = fakes([]);
  const out = await postThreadMessage({ orgId: ORG, threadId: 7, body: '   ' }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(cap.transactions.length, 0);
});

test('postThreadMessage: bad visibility → 400', async () => {
  const { deps } = fakes([]);
  const out = await postThreadMessage(
    { orgId: ORG, threadId: 7, body: 'x', visibility: 'secret' as never },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
});

// ─── listThreadMessages ──────────────────────────────────────────────────────

test('listThreadMessages: returns ascending page (reversed keyset), caps limit', async () => {
  const older = messageRow({ id: 90, body: 'first', created_at: new Date('2026-07-14T17:00:00.000Z') });
  const newer = messageRow({ id: 100, body: 'second' });
  const { deps, cap } = fakes([
    { match: /SELECT id FROM entity_threads/, rows: [{ id: 7 }] },
    { match: /FROM thread_messages tm/, rows: [newer, older] }, // DESC from DB
  ]);
  const out = await listThreadMessages({ orgId: ORG, threadId: 7, limit: 5000 }, deps);

  assert.ok(out.ok);
  assert.deepEqual(out.messages.map((m) => m.id), [90, 100]); // ascending for chat
  const page = cap.queries.find((q) => /ORDER BY tm\.created_at DESC/.test(q.text));
  assert.ok(page);
  assert.equal(page.params[3], 200); // limit capped
});

test('listThreadMessages: unknown thread → 404', async () => {
  const { deps } = fakes([{ match: /SELECT id FROM entity_threads/, rows: [] }]);
  const out = await listThreadMessages({ orgId: ORG, threadId: 999 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
});

// ─── attachSupportTicket ─────────────────────────────────────────────────────

test('attachSupportTicket: validates ticket org-scoped, sets id', async () => {
  const { deps, cap } = fakes([
    { match: /FROM entity_threads\s+WHERE id/s, rows: [threadRow()] },
    { match: /FROM support_tickets/, rows: [{ '?column?': 1 }] },
    { match: /UPDATE entity_threads/, rows: [threadRow({ support_ticket_id: 33 })] },
  ]);
  const out = await attachSupportTicket({ orgId: ORG, threadId: 7, supportTicketId: 33 }, deps);

  assert.ok(out.ok);
  assert.equal(out.idempotent, false);
  assert.equal(out.thread.supportTicketId, 33);
  const ticketCheck = cap.queries.find((q) => /FROM support_tickets/.test(q.text));
  assert.ok(ticketCheck);
  assert.deepEqual(ticketCheck.params, [33, ORG]);
});

test('attachSupportTicket: same ticket re-attach is idempotent, no UPDATE', async () => {
  const { deps, cap } = fakes([
    { match: /FROM entity_threads\s+WHERE id/s, rows: [threadRow({ support_ticket_id: 33 })] },
  ]);
  const out = await attachSupportTicket({ orgId: ORG, threadId: 7, supportTicketId: 33 }, deps);
  assert.ok(out.ok);
  assert.equal(out.idempotent, true);
  assert.equal(cap.queries.filter((q) => /UPDATE/.test(q.text)).length, 0);
});

test('attachSupportTicket: different ticket already attached → 409', async () => {
  const { deps } = fakes([
    { match: /FROM entity_threads\s+WHERE id/s, rows: [threadRow({ support_ticket_id: 22 })] },
  ]);
  const out = await attachSupportTicket({ orgId: ORG, threadId: 7, supportTicketId: 33 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 409);
});

test('attachSupportTicket: missing ticket → 404, no UPDATE', async () => {
  const { deps, cap } = fakes([
    { match: /FROM entity_threads\s+WHERE id/s, rows: [threadRow()] },
    { match: /FROM support_tickets/, rows: [] },
  ]);
  const out = await attachSupportTicket({ orgId: ORG, threadId: 7, supportTicketId: 33 }, deps);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
  assert.equal(cap.queries.filter((q) => /UPDATE/.test(q.text)).length, 0);
});

// ─── postEntityMessage ───────────────────────────────────────────────────────

test('postEntityMessage: get-or-creates the thread, then posts into it', async () => {
  const { deps, cap } = fakes([
    { match: /FROM orders WHERE/, rows: [{ '?column?': 1 }] },
    {
      match: /INSERT INTO entity_threads/,
      rows: [{ ...threadRow({ entity_type: 'ORDER', entity_id: 41 }), inserted: true }],
    },
    { match: /FROM entity_threads\s+WHERE id/s, rows: [{ id: 7, entity_type: 'ORDER', entity_id: 41 }] },
    { match: /INSERT INTO thread_messages/, rows: [messageRow({ visibility: 'internal' })] },
  ]);

  const out = await postEntityMessage(
    {
      orgId: ORG,
      entityType: 'ORDER',
      entityId: 41,
      authorStaffId: 5,
      body: 'box arrived damaged',
      clientEventId: 'ce-1',
    },
    deps,
  );

  assert.ok(out.ok);
  assert.equal(out.thread.id, 7);
  assert.equal(out.message.id, 100);
  assert.equal(out.idempotent, false);
  // Both halves run org-scoped; nothing reads an org from the caller's body.
  assert.deepEqual(cap.transactions, [ORG, ORG]);
  // The ops_events emission comes free from postThreadMessage — the whole
  // reason the ORDER note store is threads and not a purpose-built table.
  assert.equal(cap.queries.filter((q) => /INSERT INTO ops_events/.test(q.text)).length, 1);
});

test('postEntityMessage: a bad anchor fails before any transaction', async () => {
  const { deps, cap } = fakes([]);
  const out = await postEntityMessage(
    { orgId: ORG, entityType: 'sales_order', entityId: 1, body: 'hi' },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(cap.transactions.length, 0);
});

test('postEntityMessage: a blank body never opens the thread transaction', async () => {
  // An empty note must not leave an empty thread row behind as a side-effect.
  const { deps, cap } = fakes([]);
  const out = await postEntityMessage(
    { orgId: ORG, entityType: 'ORDER', entityId: 41, body: '   ' },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(cap.transactions.length, 0);
});

test('postEntityMessage: a missing parent 404s and posts nothing', async () => {
  const { deps, cap } = fakes([{ match: /FROM orders WHERE/, rows: [] }]);
  const out = await postEntityMessage(
    { orgId: ORG, entityType: 'ORDER', entityId: 999, body: 'hi' },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
  assert.equal(cap.queries.filter((q) => /INSERT INTO thread_messages/.test(q.text)).length, 0);
});
