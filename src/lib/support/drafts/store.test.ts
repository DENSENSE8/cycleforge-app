/** support_drafts store — fake PoolClient, zero DB. Pins idempotency, the stale boundary, claims and guards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import {
  claimPendingSupportDrafts,
  completeSupportDraft,
  decideDraftCompletion,
  enqueueSupportDraft,
  markSupportDraftUsed,
  openSupportDraftNow,
  pickSupportDraftViews,
  staleSupportDrafts,
  SUPPORT_DRAFT_MAX_ATTEMPTS,
  type SupportDraftOutcome,
} from './store';
import type { SupportDraftView } from '@/lib/support/conversation/model';

const ORG = '11111111-2222-3333-4444-555555555555';

interface Call {
  sql: string;
  params: unknown[];
}

/** Answers each query in order from `replies`; records every statement. */
function fakeClient(replies: Array<{ rows?: Record<string, unknown>[]; rowCount?: number }>) {
  const calls: Call[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const reply = replies.shift() ?? {};
      return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? reply.rows?.length ?? 0 };
    },
  };
  return { client: client as unknown as PoolClient, calls };
}

// ── enqueue: idempotent, boundary-aware ────────────────────────────────────

test('enqueue inserts a pending draft and returns its id', async () => {
  const { client, calls } = fakeClient([{ rowCount: 0 }, { rows: [{ id: '42' }] }]);
  const id = await enqueueSupportDraft(client, { orgId: ORG, supportItemId: 7, kind: 'reply', sourceMessageId: 900, requestedByStaffId: null });
  assert.equal(id, 42);
  assert.match(calls[1].sql, /INSERT INTO support_drafts .* 'pending'/);
  assert.match(calls[1].sql, /ON CONFLICT \(organization_id, support_ticket_id, kind, \(COALESCE\(source_message_id, 0\)\)\) WHERE status IN \('pending','ready'\) DO NOTHING/);
  assert.deepEqual(calls[1].params, [ORG, 7, 'reply', 900, null]);
});

test('a retried enqueue for the same boundary is a no-op (null)', async () => {
  const { client } = fakeClient([{ rowCount: 0 }, { rows: [] }]);
  assert.equal(
    await enqueueSupportDraft(client, { orgId: ORG, supportItemId: 7, kind: 'reply', sourceMessageId: 900, requestedByStaffId: null }),
    null,
  );
});

test('enqueue stales live drafts of the same kind on an OLDER boundary only', async () => {
  const { client, calls } = fakeClient([{ rowCount: 1 }, { rows: [{ id: 43 }] }]);
  await enqueueSupportDraft(client, { orgId: ORG, supportItemId: 7, kind: 'reply', sourceMessageId: 901, requestedByStaffId: 3 });
  assert.match(calls[0].sql, /SET status = 'stale'/);
  assert.match(calls[0].sql, /kind = \$3 AND status IN \('pending','ready'\) AND COALESCE\(source_message_id, 0\) < COALESCE\(\$4::bigint, 0\)/);
  assert.deepEqual(calls[0].params, [ORG, 7, 'reply', 901]);
});

// ── stale / used ───────────────────────────────────────────────────────────

test('staleSupportDrafts flips live drafts, optionally one kind, and reports the count', async () => {
  const { client, calls } = fakeClient([{ rowCount: 2 }]);
  assert.equal(await staleSupportDrafts(client, { orgId: ORG, supportItemId: 7, reason: 'New inbound' }), 2);
  assert.match(calls[0].sql, /status IN \('pending','ready'\)/);
  assert.deepEqual(calls[0].params, [ORG, 7, 'New inbound', null]);
  const one = fakeClient([{ rowCount: 1 }]);
  await staleSupportDrafts(one.client, { orgId: ORG, supportItemId: 7, reason: 'answered', kind: 'reply' });
  assert.equal(one.calls[0].params[3], 'reply');
});

test('markSupportDraftUsed only flips a ready or stale draft that has a body', async () => {
  const { client, calls } = fakeClient([{ rowCount: 1 }]);
  await markSupportDraftUsed(client, { orgId: ORG, draftId: 42, messageId: 1234 });
  assert.match(calls[0].sql, /SET status = 'used', used_message_id = \$3/);
  assert.match(calls[0].sql, /status IN \('ready','stale'\) AND length\(btrim\(coalesce\(body, ''\)\)\) > 0/);
  assert.deepEqual(calls[0].params, [ORG, 42, 1234]);
});

// ── claims ─────────────────────────────────────────────────────────────────

test('claims skip locked rows, honour the attempts cap and lease, and fail exhausted rows first', async () => {
  const { client, calls } = fakeClient([
    { rowCount: 1 },
    { rows: [{ id: 5, support_ticket_id: 7, kind: 'reply', source_message_id: 900, requested_by_staff_id: null, attempts: 1 }] },
  ]);
  const claimed = await claimPendingSupportDrafts(client, { orgId: ORG, limit: 3 });
  assert.match(calls[0].sql, /SET status = 'failed'.* attempts >= \$2 AND updated_at < now\(\) - make_interval/);
  assert.match(calls[1].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[1].sql, /attempts < \$2 AND \(attempts = 0 OR updated_at < now\(\) - make_interval\(secs => \$3\)\)/);
  assert.equal(calls[1].params[1], SUPPORT_DRAFT_MAX_ATTEMPTS);
  assert.equal(calls[1].params[4], 3);
  assert.deepEqual(claimed, [{ id: 5, supportItemId: 7, kind: 'reply', sourceMessageId: 900, requestedByStaffId: null, attempts: 1 }]);
});

// ── "Draft with AI" opening ────────────────────────────────────────────────

test('open-now refuses while another worker holds the live draft', async () => {
  const { client, calls } = fakeClient([{ rows: [{ id: 5, status: 'pending', attempts: 1, leased: true }] }]);
  assert.deepEqual(
    await openSupportDraftNow(client, { orgId: ORG, supportItemId: 7, kind: 'reply', sourceMessageId: 900, staffId: 3 }),
    { ok: false, reason: 'draft_in_progress' },
  );
  assert.equal(calls.length, 1);
});

test('open-now claims an unclaimed pending draft instead of inserting a second', async () => {
  const { client, calls } = fakeClient([{ rows: [{ id: 5, status: 'pending', attempts: 0, leased: true }] }, { rowCount: 1 }]);
  assert.deepEqual(
    await openSupportDraftNow(client, { orgId: ORG, supportItemId: 7, kind: 'reply', sourceMessageId: 900, staffId: 3 }),
    { ok: true, draftId: 5 },
  );
  assert.match(calls[1].sql, /SET attempts = attempts \+ 1/);
  assert.equal(calls.length, 2);
});

test('open-now discards a ready draft and starts a fresh one for the same boundary', async () => {
  const { client, calls } = fakeClient([
    { rows: [{ id: 5, status: 'ready', attempts: 1, leased: false }] },
    { rowCount: 1 },
    { rowCount: 0 },
    { rows: [{ id: 6 }] },
    { rowCount: 1 },
  ]);
  assert.deepEqual(
    await openSupportDraftNow(client, { orgId: ORG, supportItemId: 7, kind: 'reply', sourceMessageId: 900, staffId: 3 }),
    { ok: true, draftId: 6 },
  );
  assert.match(calls[1].sql, /SET status = 'discarded'/);
  assert.match(calls[3].sql, /INSERT INTO support_drafts/);
});

// ── completion: the stale boundary ─────────────────────────────────────────

const pending = { status: 'pending' as const, sourceMessageId: 900, attempts: 1 };

test('a draft whose boundary is still the newest inbound becomes ready', () => {
  assert.deepEqual(
    decideDraftCompletion({ current: pending, purpose: 'customer_conversation', newestInboundId: 900, outcome: { ok: true }, retryOnFailure: true }),
    { status: 'ready' },
  );
});

test('a newer inbound message makes the draft stale, never ready', () => {
  const out = decideDraftCompletion({ current: pending, purpose: 'customer_conversation', newestInboundId: 901, outcome: { ok: true }, retryOnFailure: true });
  assert.equal(out.status, 'stale');
});

test('a check-in draft goes stale once the customer has written', () => {
  const out = decideDraftCompletion({
    current: { ...pending, sourceMessageId: null },
    purpose: 'customer_conversation',
    newestInboundId: 950,
    outcome: { ok: true },
    retryOnFailure: true,
  });
  assert.equal(out.status, 'stale');
});

test('a purpose change to internal (or unclassified) stales the draft', () => {
  for (const purpose of ['internal_record', 'unclassified'] as const) {
    assert.equal(
      decideDraftCompletion({ current: pending, purpose, newestInboundId: 900, outcome: { ok: true }, retryOnFailure: true }).status,
      'stale',
    );
  }
});

test('a row staled or discarded meanwhile is left alone', () => {
  assert.deepEqual(
    decideDraftCompletion({ current: { ...pending, status: 'stale' }, purpose: 'customer_conversation', newestInboundId: 900, outcome: { ok: true }, retryOnFailure: true }),
    { status: 'skip' },
  );
});

test('a retryable failure stays pending under the cap, then fails; the door never retries', () => {
  const fail = { ok: false as const, error: 'AI returned 503', retryable: true };
  assert.equal(decideDraftCompletion({ current: pending, purpose: 'customer_conversation', newestInboundId: 900, outcome: fail, retryOnFailure: true }).status, 'pending');
  assert.equal(
    decideDraftCompletion({
      current: { ...pending, attempts: SUPPORT_DRAFT_MAX_ATTEMPTS },
      purpose: 'customer_conversation',
      newestInboundId: 900,
      outcome: fail,
      retryOnFailure: true,
    }).status,
    'failed',
  );
  assert.equal(decideDraftCompletion({ current: pending, purpose: 'customer_conversation', newestInboundId: 900, outcome: fail, retryOnFailure: false }).status, 'failed');
});

const READY: SupportDraftOutcome = {
  ok: true,
  body: 'It ships Monday, October 5.',
  confidence: 'medium',
  citations: [{ type: 'order', label: 'Order 1', ref: 'orders:1' }],
  warnings: [],
  missingFacts: [],
  model: 'qwen3',
  sourceMessageCount: 3,
};

test('completion re-reads the newest inbound under the row lock and stores ready with its facts', async () => {
  const { client, calls } = fakeClient([
    { rows: [{ status: 'pending', source_message_id: 900, attempts: 1, purpose: 'customer_conversation', newest_inbound_id: 900 }] },
    { rows: [{ id: 5, kind: 'reply', status: 'ready', body: READY.body, confidence: 'medium', citations: READY.citations, warnings: [], missing_facts: [], model: 'qwen3', source_message_id: 900, created_at: new Date('2026-10-04T10:00:00Z'), completed_at: new Date('2026-10-04T10:00:05Z') }] },
  ]);
  const { completion, view } = await completeSupportDraft(client, { orgId: ORG, draftId: 5, outcome: READY, retryOnFailure: true });
  assert.match(calls[0].sql, /FOR UPDATE OF d/);
  assert.match(calls[0].sql, /tm\.direction = 'inbound'/);
  assert.deepEqual(completion, { status: 'ready' });
  assert.match(calls[1].sql, /SET status = 'ready'/);
  assert.equal(calls[1].params[4], JSON.stringify(READY.citations));
  assert.equal(calls[1].params[7], 'qwen3');
  assert.equal(view?.status, 'ready');
  assert.equal(view?.model, 'qwen3');
});

test('completion writes stale — not ready — when a newer inbound landed during generation', async () => {
  const { client, calls } = fakeClient([
    { rows: [{ status: 'pending', source_message_id: 900, attempts: 1, purpose: 'customer_conversation', newest_inbound_id: 902 }] },
    { rows: [{ id: 5, kind: 'reply', status: 'stale', stale_reason: 'A newer customer message arrived.', citations: '[]', warnings: '[]', missing_facts: '[]', created_at: '2026-10-04T10:00:00Z' }] },
  ]);
  const { completion, view } = await completeSupportDraft(client, { orgId: ORG, draftId: 5, outcome: READY, retryOnFailure: true });
  assert.equal(completion.status, 'stale');
  assert.match(calls[1].sql, /SET status = 'stale'/);
  assert.doesNotMatch(calls[1].sql, /'ready'/);
  assert.equal(view?.status, 'stale');
});

// ── views ──────────────────────────────────────────────────────────────────

test('the record shows the newest live draft per kind, then recent stale / failed', () => {
  const v = (id: number, kind: SupportDraftView['kind'], status: SupportDraftView['status']): SupportDraftView => ({
    id, kind, status, body: null, confidence: null, citations: [], warnings: [], missingFacts: [], model: null,
    sourceMessageId: null, staleReason: null, error: null, createdAt: '2026-10-04T00:00:00Z', completedAt: null,
  });
  const picked = pickSupportDraftViews([v(9, 'reply', 'ready'), v(8, 'reply', 'pending'), v(7, 'check_in', 'pending'), v(6, 'reply', 'used'), v(5, 'reply', 'stale')]);
  assert.deepEqual(picked.map((d) => d.id), [9, 7, 5]);
});
