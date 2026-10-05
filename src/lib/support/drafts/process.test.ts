/** Draft worker + "Draft with AI" door — every collaborator injected, zero DB, zero network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupportDraftView } from '@/lib/support/conversation/model';
import { SupportSuggestError, type SupportSuggestion } from '@/lib/support/suggest-reply-core';
import type { SupportDraftContext } from './context';
import { draftContext, draftMessage } from './fixtures';
import { draftSupportItemNow, processPendingSupportDrafts, type SupportDraftProcessDeps } from './process';
import { decideDraftCompletion, type ClaimedSupportDraft, type OpenSupportDraftResult, type SupportDraftOutcome } from './store';

const ORG = '11111111-2222-3333-4444-555555555555';

function suggestion(over: Partial<SupportSuggestion> = {}): SupportSuggestion {
  return {
    suggestion: 'It ships Monday, October 5.',
    sources: [{ type: 'order', label: 'Order 12-34567-89012', ref: 'orders:501' }],
    confidence: 'medium',
    warnings: [],
    missingFacts: [],
    mode: 'local-only',
    model: 'qwen3',
    grounded: false,
    searchHits: [],
    evidence: [],
    ...over,
  };
}

function view(status: SupportDraftView['status'], id = 5): SupportDraftView {
  return {
    id, kind: 'reply', status, body: status === 'ready' ? 'It ships Monday, October 5.' : null, confidence: 'medium',
    citations: [], warnings: [], missingFacts: [], model: 'qwen3', sourceMessageId: null, staleReason: null, error: null,
    createdAt: '2026-10-04T10:00:00Z', completedAt: null,
  };
}

interface Cap {
  drafted: Array<{ kind: string; staffId: number | null }>;
  completed: Array<{ draftId: number; outcome: SupportDraftOutcome; retryOnFailure: boolean }>;
  opened: unknown[];
}

/**
 * `complete` runs the REAL decision against the inbound boundary the test says
 * is newest at write time, so the stale rule is exercised end to end.
 */
function fakes(opts: {
  context: SupportDraftContext | null;
  claimed?: ClaimedSupportDraft[];
  newestAtWrite?: number | null;
  draft?: () => Promise<SupportSuggestion>;
  open?: OpenSupportDraftResult;
}) {
  const cap: Cap = { drafted: [], completed: [], opened: [] };
  const deps: SupportDraftProcessDeps = {
    claimPending: async () => opts.claimed ?? [],
    readContext: async () => opts.context,
    draft: async (_org, args) => {
      cap.drafted.push({ kind: args.kind, staffId: args.staffId });
      return (opts.draft ?? (async () => suggestion()))();
    },
    openNow: async (_org, args) => {
      cap.opened.push(args);
      return opts.open ?? { ok: true, draftId: 5 };
    },
    complete: async (_org, args) => {
      cap.completed.push(args);
      const boundary = opts.context ? [...opts.context.messages].reverse().find((m) => m.direction === 'inbound')?.id ?? null : null;
      const claimed = opts.claimed?.find((c) => c.id === args.draftId);
      const completion = decideDraftCompletion({
        current: { status: 'pending', sourceMessageId: claimed ? claimed.sourceMessageId : boundary, attempts: claimed?.attempts ?? 1 },
        purpose: opts.context?.item.purpose ?? 'customer_conversation',
        newestInboundId: opts.newestAtWrite === undefined ? boundary : opts.newestAtWrite,
        outcome: args.outcome.ok ? { ok: true } : args.outcome,
        retryOnFailure: args.retryOnFailure,
      });
      const status = completion.status === 'skip' || completion.status === 'pending' ? 'pending' : completion.status;
      return { completion, view: view(status, args.draftId) };
    },
  };
  return { deps, cap };
}

// ── the worker ─────────────────────────────────────────────────────────────

test('worker: a claimed draft on the current boundary is drafted and stored ready', async () => {
  const context = draftContext();
  const boundary = context.messages[0].id;
  const { deps, cap } = fakes({ context, claimed: [{ id: 5, supportItemId: 77, kind: 'reply', sourceMessageId: boundary, requestedByStaffId: null, attempts: 1 }] });
  assert.deepEqual(await processPendingSupportDrafts(ORG, {}, deps), { processed: 1, ready: 1, failed: 0 });
  const [done] = cap.completed;
  assert.equal(done.retryOnFailure, true);
  assert.equal(done.outcome.ok && done.outcome.model, 'qwen3');
  assert.equal(done.outcome.ok && done.outcome.sourceMessageCount, 1);
});

test('worker: a draft behind a newer inbound spends no model call and ends stale', async () => {
  const context = draftContext({
    messages: [draftMessage({ direction: 'inbound', body: 'first' }), draftMessage({ direction: 'inbound', body: 'second' })],
  });
  const old = context.messages[0].id;
  const { deps, cap } = fakes({ context, claimed: [{ id: 5, supportItemId: 77, kind: 'reply', sourceMessageId: old, requestedByStaffId: null, attempts: 1 }] });
  assert.deepEqual(await processPendingSupportDrafts(ORG, {}, deps), { processed: 1, ready: 0, failed: 0 });
  assert.equal(cap.drafted.length, 0);
  assert.equal(cap.completed[0].outcome.ok, false);
});

test('worker: a customer message landing DURING generation makes the draft stale, never ready', async () => {
  const context = draftContext();
  const boundary = context.messages[0].id;
  const { deps } = fakes({
    context,
    claimed: [{ id: 5, supportItemId: 77, kind: 'reply', sourceMessageId: boundary, requestedByStaffId: null, attempts: 1 }],
    newestAtWrite: boundary + 1,
  });
  assert.deepEqual(await processPendingSupportDrafts(ORG, {}, deps), { processed: 1, ready: 0, failed: 0 });
});

test('worker: an internal item is never drafted', async () => {
  const context = draftContext({ item: { purpose: 'internal_record' } });
  const { deps, cap } = fakes({ context, claimed: [{ id: 5, supportItemId: 77, kind: 'reply', sourceMessageId: context.messages[0].id, requestedByStaffId: null, attempts: 1 }] });
  await processPendingSupportDrafts(ORG, {}, deps);
  assert.equal(cap.drafted.length, 0);
});

test('worker: a model failure retries under the cap, then fails', async () => {
  const context = draftContext();
  const boundary = context.messages[0].id;
  const failing = async () => {
    throw new SupportSuggestError(502, 'AI returned 503.');
  };
  const first = fakes({ context, claimed: [{ id: 5, supportItemId: 77, kind: 'reply', sourceMessageId: boundary, requestedByStaffId: null, attempts: 1 }], draft: failing });
  assert.deepEqual(await processPendingSupportDrafts(ORG, {}, first.deps), { processed: 1, ready: 0, failed: 0 });
  const last = fakes({ context, claimed: [{ id: 5, supportItemId: 77, kind: 'reply', sourceMessageId: boundary, requestedByStaffId: null, attempts: 3 }], draft: failing });
  assert.deepEqual(await processPendingSupportDrafts(ORG, {}, last.deps), { processed: 1, ready: 0, failed: 1 });
});

test('worker: a check-in draft is drafted as a check-in', async () => {
  const context = draftContext({ item: { kind: 'post_purchase_check_in' }, messages: [] });
  const { deps, cap } = fakes({ context, claimed: [{ id: 6, supportItemId: 77, kind: 'check_in', sourceMessageId: null, requestedByStaffId: null, attempts: 1 }] });
  assert.deepEqual(await processPendingSupportDrafts(ORG, {}, deps), { processed: 1, ready: 1, failed: 0 });
  assert.equal(cap.drafted[0].kind, 'check_in');
});

// ── the door ───────────────────────────────────────────────────────────────

test('door: 404 for an item not in this org', async () => {
  const { deps } = fakes({ context: null });
  const out = await draftSupportItemNow(ORG, 77, 3, {}, deps);
  assert.equal(!out.ok && out.status, 404);
});

test('door: internal and unclassified items are refused with a reason, before any draft row or model call', async () => {
  for (const [purpose, reason] of [['internal_record', 'internal_record'], ['unclassified', 'unclassified']] as const) {
    const { deps, cap } = fakes({ context: draftContext({ item: { purpose } }) });
    const out = await draftSupportItemNow(ORG, 77, 3, {}, deps);
    assert.deepEqual(out.ok ? null : [out.status, out.reason], [422, reason]);
    assert.equal(cap.opened.length, 0);
    assert.equal(cap.drafted.length, 0);
  }
});

test('door: a conversation with no message and no photo has nothing to answer', async () => {
  const { deps, cap } = fakes({ context: draftContext({ messages: [] }) });
  const out = await draftSupportItemNow(ORG, 77, 3, {}, deps);
  assert.deepEqual(out.ok ? null : [out.status, out.reason], [422, 'no_customer_message']);
  assert.equal(cap.opened.length, 0);
});

test('door: drafts against the newest inbound boundary, stores ready, and keeps the full suggestion', async () => {
  const context = draftContext();
  const { deps, cap } = fakes({ context });
  const out = await draftSupportItemNow(ORG, 77, 3, { stagedPhotoIds: [9] }, deps);
  assert.equal(out.ok, true);
  assert.deepEqual(cap.opened[0], { supportItemId: 77, kind: 'reply', sourceMessageId: context.messages[0].id, staffId: 3 });
  assert.equal(cap.completed[0].retryOnFailure, false);
  assert.equal(out.ok && out.suggestion.model, 'qwen3');
  assert.equal(out.ok && out.draft.status, 'ready');
});

test('door: 409 while another worker writes the same draft', async () => {
  const { deps, cap } = fakes({ context: draftContext(), open: { ok: false, reason: 'draft_in_progress' } });
  const out = await draftSupportItemNow(ORG, 77, 3, {}, deps);
  assert.deepEqual(out.ok ? null : [out.status, out.reason], [409, 'draft_in_progress']);
  assert.equal(cap.drafted.length, 0);
});

test('door: a newer message during generation is a 409 stale, not a stale draft returned as ready', async () => {
  const context = draftContext();
  const { deps } = fakes({ context, newestAtWrite: context.messages[0].id + 1 });
  const out = await draftSupportItemNow(ORG, 77, 3, {}, deps);
  assert.deepEqual(out.ok ? null : [out.status, out.reason], [409, 'stale']);
});

test('door: a model failure is a 502 with the reason, stored failed (no silent retry)', async () => {
  const { deps } = fakes({
    context: draftContext(),
    draft: async () => {
      throw new SupportSuggestError(502, 'Every AI provider failed (platform: HTTP 503)');
    },
  });
  const out = await draftSupportItemNow(ORG, 77, 3, {}, deps);
  assert.deepEqual(out.ok ? null : [out.status, out.reason, out.error], [502, 'generation_failed', 'Every AI provider failed (platform: HTTP 503)']);
});
