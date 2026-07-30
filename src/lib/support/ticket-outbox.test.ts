import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TICKET_WORK_TYPES,
  drainTicketWorkOutbox,
  enqueueTicketWork,
  isTicketWorkType,
  type EnqueueTicketWorkArgs,
  type EnqueueTicketWorkDeps,
  type TicketOutboxDeps,
  type TicketWorkClaim,
} from './ticket-outbox';

const ORG = '00000000-0000-0000-0000-000000000002';

function claim(patch: Partial<TicketWorkClaim> = {}): TicketWorkClaim {
  return {
    id: 1,
    organizationId: ORG,
    workType: 'CREATE_TICKET',
    entityType: 'REPAIR',
    entityId: 42,
    providerTicketId: null,
    counterTransactionId: 7,
    payload: { subject: 'Counter service', body: 'Dropped off at the counter.' },
    ...patch,
  };
}

/**
 * Fake drain deps that record every call. `helpdeskFailures` makes the provider
 * throw the first N times so a retry sweep can be asserted.
 */
function fakes(opts: { helpdeskFailures?: number; helpdeskConnected?: boolean } = {}) {
  let remainingFailures = opts.helpdeskFailures ?? 0;
  const connected = opts.helpdeskConnected ?? true;
  const calls = {
    created: [] as Array<{ subject: string; publicReply: boolean; idempotencyKey?: string }>,
    replies: [] as Array<{ ticketId: number; body: string; publicReply: boolean }>,
    linked: [] as Array<{ providerTicketId: number; entityType: string; entityId: number }>,
    stamped: [] as Array<{ entityId: number; providerTicketId: number }>,
    processed: [] as number[],
    failed: [] as Array<{ ids: number[]; error: string }>,
    released: [] as number[],
  };
  let pending: TicketWorkClaim[] = [];

  const deps: TicketOutboxDeps = {
    async claimPending() {
      const batch = pending;
      pending = [];
      return batch;
    },
    async createTicket(_orgId, input, opts2) {
      if (!connected) return null;
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error('helpdesk 503');
      }
      calls.created.push({
        subject: input.subject,
        publicReply: input.publicReply,
        idempotencyKey: opts2.idempotencyKey,
      });
      return { providerTicketId: 9001 };
    },
    async postReply(_orgId, ticketId, comment) {
      if (!connected) return false;
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error('helpdesk 503');
      }
      calls.replies.push({ ticketId, body: comment.body, publicReply: comment.publicReply });
      return true;
    },
    async linkAnchor(args) {
      calls.linked.push({
        providerTicketId: args.providerTicketId,
        entityType: args.entityType,
        entityId: args.entityId,
      });
    },
    async stampEntityTicketNumber(args) {
      calls.stamped.push({ entityId: args.entityId, providerTicketId: args.providerTicketId });
    },
    async markProcessed(ids) {
      calls.processed.push(...ids);
    },
    async markFailed(ids, error) {
      calls.failed.push({ ids, error });
    },
    async releaseClaim(ids) {
      calls.released.push(...ids);
    },
  };

  return { deps, calls, queue: (rows: TicketWorkClaim[]) => { pending = rows; } };
}

// ── enqueue ─────────────────────────────────────────────────────────────────

test('enqueue returns the new row id', async () => {
  const seen: EnqueueTicketWorkArgs[] = [];
  const res = await enqueueTicketWork(
    { orgId: ORG, workType: 'CREATE_TICKET', entityType: 'REPAIR', entityId: 42 },
    { async insert(args) { seen.push(args); return 55; } },
  );
  assert.deepEqual(res, { outboxId: 55, queued: true });
  assert.equal(seen.length, 1);
});

test('a deduped insert (null id) still reports queued', async () => {
  // ON CONFLICT DO NOTHING returns no row — a duplicate submit is success.
  const res = await enqueueTicketWork(
    { orgId: ORG, workType: 'CREATE_TICKET', entityType: 'REPAIR', entityId: 42 },
    { async insert() { return null; } },
  );
  assert.deepEqual(res, { outboxId: null, queued: true });
});

test('enqueue NEVER throws — a queueing failure cannot fail a paid transaction', async () => {
  const res = await enqueueTicketWork(
    { orgId: ORG, workType: 'CREATE_TICKET', entityType: 'REPAIR', entityId: 42 },
    { async insert() { throw new Error('db down'); } },
  );
  assert.deepEqual(res, { outboxId: null, queued: false });
});

test('enqueue rejects the CHECK-violating provider-ticket pairings before hitting the DB', async () => {
  let inserts = 0;
  const insert: EnqueueTicketWorkDeps = { async insert() { inserts += 1; return 1; } };

  // CREATE must not carry a provider ticket…
  const bad1 = await enqueueTicketWork(
    { orgId: ORG, workType: 'CREATE_TICKET', entityType: 'REPAIR', entityId: 1, providerTicketId: 5 },
    insert,
  );
  // …and ATTACH/REPLY must.
  const bad2 = await enqueueTicketWork(
    { orgId: ORG, workType: 'ATTACH_TICKET', entityType: 'REPAIR', entityId: 1 },
    insert,
  );
  const bad3 = await enqueueTicketWork(
    { orgId: ORG, workType: 'POST_REPLY', entityType: 'REPAIR', entityId: 1 },
    insert,
  );

  assert.equal(bad1.queued, false);
  assert.equal(bad2.queued, false);
  assert.equal(bad3.queued, false);
  assert.equal(inserts, 0, 'no DB round trip for a shape the CHECK would reject');
});

// ── drain: create ───────────────────────────────────────────────────────────

test('CREATE_TICKET creates, links the anchor, stamps the number, and settles', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ payload: { subject: 'RS-1 intake', body: 'x', idempotencyKey: 'idem-1' } })]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.created, 1);
  assert.equal(res.failed, 0);
  assert.deepEqual(calls.created[0].subject, 'RS-1 intake');
  assert.equal(calls.created[0].idempotencyKey, 'idem-1', 'idempotency key must reach the provider');
  assert.deepEqual(calls.linked, [{ providerTicketId: 9001, entityType: 'REPAIR', entityId: 42 }]);
  assert.deepEqual(calls.stamped, [{ entityId: 42, providerTicketId: 9001 }]);
  assert.deepEqual(calls.processed, [1]);
});

test('an auto-posted ticket defaults to INTERNAL, never customer-visible', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ payload: { subject: 's', body: 'b' } })]);
  await drainTicketWorkOutbox({}, deps);
  assert.equal(calls.created[0].publicReply, false);
});

test('publicReply: true is honored when the caller asks for it explicitly', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ payload: { subject: 's', body: 'b', publicReply: true } })]);
  await drainTicketWorkOutbox({}, deps);
  assert.equal(calls.created[0].publicReply, true);
});

// ── drain: retry — the case doc 03 asks for ─────────────────────────────────

test('a failed helpdesk call is marked failed, then SUCCEEDS on the next sweep', async () => {
  const { deps, calls, queue } = fakes({ helpdeskFailures: 1 });

  // Sweep 1: provider throws.
  queue([claim()]);
  const first = await drainTicketWorkOutbox({}, deps);
  assert.equal(first.created, 0);
  assert.equal(first.failed, 1);
  assert.equal(calls.failed[0].error, 'helpdesk 503');
  assert.deepEqual(calls.processed, [], 'nothing settled while the provider was down');

  // Sweep 2: the same row is re-claimed and the provider is healthy.
  queue([claim()]);
  const second = await drainTicketWorkOutbox({}, deps);
  assert.equal(second.created, 1);
  assert.equal(second.failed, 0);
  assert.deepEqual(calls.processed, [1], 'the retry settles the row');
  assert.equal(calls.linked.length, 1, 'the ticket links exactly once across both sweeps');
});

test('an unconnected helpdesk releases the claim WITHOUT burning an attempt', async () => {
  // A tenant with no helpdesk has nothing to retry — its queue must not
  // dead-letter itself while it waits for someone to connect one.
  const { deps, calls, queue } = fakes({ helpdeskConnected: false });
  queue([claim()]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.created, 0);
  assert.equal(res.failed, 0, 'not connected is not a failure');
  assert.deepEqual(calls.released, [1]);
  assert.deepEqual(calls.failed, []);
});

// ── drain: attach + reply ───────────────────────────────────────────────────

test('ATTACH_TICKET links an existing ticket without creating one', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ workType: 'ATTACH_TICKET', providerTicketId: 777, payload: {} })]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.attached, 1);
  assert.deepEqual(calls.created, [], 'attach must never mint a ticket');
  assert.deepEqual(calls.linked, [{ providerTicketId: 777, entityType: 'REPAIR', entityId: 42 }]);
  assert.deepEqual(calls.processed, [1]);
});

test('POST_REPLY posts the body to the existing ticket', async () => {
  const { deps, calls, queue } = fakes();
  queue([
    claim({ workType: 'POST_REPLY', providerTicketId: 777, payload: { body: 'Ready for pickup' } }),
  ]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.replied, 1);
  assert.deepEqual(calls.replies, [
    { ticketId: 777, body: 'Ready for pickup', publicReply: false },
  ]);
  assert.deepEqual(calls.processed, [1]);
});

test('POST_REPLY with an empty body dead-letters instead of posting blank', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ workType: 'POST_REPLY', providerTicketId: 777, payload: { body: '   ' } })]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.failed, 1);
  assert.deepEqual(calls.replies, []);
  assert.match(calls.failed[0].error, /empty body/);
});

test('ATTACH/REPLY with a missing provider ticket id fails loudly', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ workType: 'ATTACH_TICKET', providerTicketId: null })]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.failed, 1);
  assert.deepEqual(calls.linked, []);
  assert.match(calls.failed[0].error, /no provider_ticket_id/);
});

// ── drain: hygiene ──────────────────────────────────────────────────────────

test('an unknown work_type dead-letters rather than being re-claimed forever', async () => {
  const { deps, calls, queue } = fakes();
  queue([claim({ workType: 'TELEPORT_TICKET' })]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.failed, 1);
  assert.match(calls.failed[0].error, /unsupported work_type/);
  assert.deepEqual(calls.created, []);
});

test('one poison row does not stop the rest of the batch', async () => {
  const { deps, calls, queue } = fakes();
  queue([
    claim({ id: 1, workType: 'POST_REPLY', providerTicketId: 1, payload: { body: '' } }),
    claim({ id: 2 }),
    claim({ id: 3, workType: 'ATTACH_TICKET', providerTicketId: 55, payload: {} }),
  ]);

  const res = await drainTicketWorkOutbox({}, deps);

  assert.equal(res.failed, 1);
  assert.equal(res.created, 1);
  assert.equal(res.attached, 1);
  assert.deepEqual(calls.processed.sort(), [2, 3]);
});

test('an empty queue is a cheap no-op', async () => {
  const { deps, calls, queue } = fakes();
  queue([]);
  const res = await drainTicketWorkOutbox({}, deps);
  assert.deepEqual(res, { claimed: 0, created: 0, attached: 0, replied: 0, failed: 0 });
  assert.deepEqual(calls.processed, []);
});

test('the work-type vocabulary matches the DB CHECK', () => {
  assert.deepEqual([...TICKET_WORK_TYPES], ['CREATE_TICKET', 'ATTACH_TICKET', 'POST_REPLY']);
  assert.equal(isTicketWorkType('POST_REPLY'), true);
  assert.equal(isTicketWorkType('DELETE_TICKET'), false);
});
