/**
 * The Support draft worker and the "Draft with AI" door. Both run the ONE
 * drafter (`suggestSupportReplyCore` via `makeSuggestDeps`) over the LOCAL
 * context, store the result on `support_drafts`, and never send anything.
 *
 *   processPendingSupportDrafts  — after() of an inbound ingest, and the
 *                                  support-loop cron: claim → draft → store.
 *   generateSupportDraftNow      — the staffer asked for a draft right now.
 */
import type { SupportDraftKind, SupportDraftView } from '@/lib/support/conversation/model';
import type { OrgId } from '@/lib/tenancy/constants';
import { SupportSuggestError, type SupportSuggestion } from '@/lib/support/suggest-reply-core';
import { contextCitations, draftKindFor, newestInboundMessage, type SupportDraftContext } from './context';
import type {
  ClaimedSupportDraft,
  OpenSupportDraftResult,
  SupportDraftCompletion,
  SupportDraftOutcome,
} from './store';

export interface SupportDraftProcessDeps {
  claimPending(orgId: OrgId, args: { supportItemId?: number; limit: number }): Promise<ClaimedSupportDraft[]>;
  readContext(orgId: OrgId, supportItemId: number, opts: { stagedPhotoIds?: number[] }): Promise<SupportDraftContext | null>;
  /** Persona + vision lane + image URLs + the drafter. Throws on a generation failure. */
  draft(orgId: OrgId, args: { context: SupportDraftContext; kind: SupportDraftKind; staffId: number | null }): Promise<SupportSuggestion>;
  openNow(
    orgId: OrgId,
    args: { supportItemId: number; kind: SupportDraftKind; sourceMessageId: number | null; staffId: number | null },
  ): Promise<OpenSupportDraftResult>;
  complete(
    orgId: OrgId,
    args: { draftId: number; outcome: SupportDraftOutcome; retryOnFailure: boolean },
  ): Promise<{ completion: SupportDraftCompletion; view: SupportDraftView | null }>;
}

/** The worker's batch: model calls are heavy and a local box serves one at a time. */
const DEFAULT_BATCH = 5;

function failureOf(err: unknown): { error: string; retryable: boolean } {
  const message = err instanceof Error ? err.message : 'Drafting failed.';
  // A request the drafter refused (400) will refuse again; a model/gateway
  // failure (502, network, timeout) may not.
  return { error: message, retryable: !(err instanceof SupportSuggestError && err.status === 400) };
}

function outcomeOf(suggestion: SupportSuggestion, context: SupportDraftContext): SupportDraftOutcome {
  return {
    ok: true,
    body: suggestion.suggestion,
    confidence: suggestion.confidence,
    citations: suggestion.sources.length ? suggestion.sources : contextCitations(context),
    warnings: suggestion.warnings,
    missingFacts: suggestion.missingFacts,
    model: suggestion.model,
    sourceMessageCount: context.messages.length,
  };
}

/** Why an item takes no customer draft — null when it does. */
function purposeRefusal(context: SupportDraftContext): { reason: string; error: string } | null {
  if (context.item.purpose === 'customer_conversation') return null;
  if (context.item.purpose === 'internal_record') {
    return { reason: 'internal_record', error: 'This is an internal record — drafts are written only for customer conversations.' };
  }
  return {
    reason: 'unclassified',
    error: 'Mark this as a customer conversation first — drafts are written only for customer conversations.',
  };
}

async function defaultDeps(): Promise<SupportDraftProcessDeps> {
  // Loaded lazily: the server bindings (DB pool, provider chain) stay out of
  // the unit tests, which inject every collaborator.
  const [{ withTenantTransaction }, store, { readSupportDraftContext }, binding] = await Promise.all([
    import('@/lib/tenancy/db'),
    import('./store'),
    import('./context-read'),
    import('@/lib/support/suggest-reply'),
  ]);
  return {
    claimPending: (orgId, args) => withTenantTransaction(orgId, (c) => store.claimPendingSupportDrafts(c, { orgId, ...args })),
    readContext: readSupportDraftContext,
    draft: binding.draftSupportContext,
    openNow: (orgId, args) => withTenantTransaction(orgId, (c) => store.openSupportDraftNow(c, { orgId, ...args })),
    complete: (orgId, args) => withTenantTransaction(orgId, (c) => store.completeSupportDraft(c, { orgId, ...args })),
  };
}

/**
 * Claim pending drafts, generate, and store each as ready | stale | failed (or
 * leave it pending for a retry under the attempts cap). Safe to run
 * concurrently: claims never overlap. Never sends.
 */
export async function processPendingSupportDrafts(
  orgId: OrgId,
  opts: { supportItemId?: number; limit?: number } = {},
  deps?: SupportDraftProcessDeps,
): Promise<{ processed: number; ready: number; failed: number }> {
  const d = deps ?? (await defaultDeps());
  const claimed = await d.claimPending(orgId, { supportItemId: opts.supportItemId, limit: opts.limit ?? DEFAULT_BATCH });
  let ready = 0;
  let failed = 0;
  for (const draft of claimed) {
    let outcome: SupportDraftOutcome;
    try {
      const context = await d.readContext(orgId, draft.supportItemId, {});
      const boundary = context ? newestInboundMessage(context.messages)?.id ?? null : null;
      if (!context) {
        outcome = { ok: false, error: 'The Support item no longer exists.', retryable: false };
      } else if (purposeRefusal(context) || boundary !== draft.sourceMessageId) {
        // The store re-checks under the row lock and marks it stale; no model call spent.
        outcome = { ok: false, error: 'Superseded before drafting.', retryable: false };
      } else {
        outcome = outcomeOf(await d.draft(orgId, { context, kind: draft.kind, staffId: draft.requestedByStaffId }), context);
      }
    } catch (err) {
      outcome = { ok: false, ...failureOf(err) };
    }
    const { completion } = await d.complete(orgId, { draftId: draft.id, outcome, retryOnFailure: true });
    if (completion.status === 'ready') ready += 1;
    if (completion.status === 'failed') failed += 1;
  }
  return { processed: claimed.length, ready, failed };
}

export type SupportDraftNowResult =
  | { ok: true; draft: SupportDraftView; suggestion: SupportSuggestion }
  | { ok: false; status: 404 | 409 | 422 | 502; reason: string; error: string };

/**
 * Draft now, keeping the drafter's full result (lane, grounding, record hits,
 * photo evidence) for callers that show it — the station suggest route.
 */
export async function draftSupportItemNow(
  orgId: OrgId,
  supportItemId: number,
  staffId: number | null,
  opts: { stagedPhotoIds?: number[] } = {},
  deps?: SupportDraftProcessDeps,
): Promise<SupportDraftNowResult> {
  const d = deps ?? (await defaultDeps());
  const context = await d.readContext(orgId, supportItemId, { stagedPhotoIds: opts.stagedPhotoIds });
  if (!context) return { ok: false, status: 404, reason: 'not_found', error: `Support item #${supportItemId} not found.` };
  const refusal = purposeRefusal(context);
  if (refusal) return { ok: false, status: 422, ...refusal };

  const kind = draftKindFor(context.item.kind, context.messages);
  const boundary = newestInboundMessage(context.messages)?.id ?? null;
  // A photo alone is a question, and a staff-logged case drafts from its log;
  // a reply with no message and no photo has nothing to answer.
  if (kind === 'reply' && context.messages.length === 0 && context.photos.length === 0) {
    return {
      ok: false,
      status: 422,
      reason: 'no_customer_message',
      error: 'There is no customer message on this conversation yet — nothing to answer.',
    };
  }

  const opened = await d.openNow(orgId, { supportItemId, kind, sourceMessageId: boundary, staffId });
  if (!opened.ok) {
    return { ok: false, status: 409, reason: opened.reason, error: 'A draft for this message is already being written — try again shortly.' };
  }

  let outcome: SupportDraftOutcome;
  let suggestion: SupportSuggestion | null = null;
  try {
    suggestion = await d.draft(orgId, { context, kind, staffId });
    outcome = outcomeOf(suggestion, context);
  } catch (err) {
    outcome = { ok: false, ...failureOf(err) };
  }
  const { completion, view } = await d.complete(orgId, { draftId: opened.draftId, outcome, retryOnFailure: false });

  if (completion.status === 'ready' && view && suggestion) return { ok: true, draft: view, suggestion };
  if (completion.status === 'stale') return { ok: false, status: 409, reason: 'stale', error: `${completion.reason} Draft again.` };
  if (completion.status === 'failed') return { ok: false, status: 502, reason: 'generation_failed', error: completion.error };
  return { ok: false, status: 409, reason: 'superseded', error: 'The draft changed while it was being written — draft again.' };
}

/** "Draft with AI" — refuses unless the item is an acknowledged customer conversation. */
export async function generateSupportDraftNow(
  orgId: OrgId,
  supportItemId: number,
  staffId: number | null,
  opts?: { stagedPhotoIds?: number[] },
): Promise<{ ok: true; draft: SupportDraftView } | { ok: false; status: 404 | 409 | 422 | 502; reason: string; error: string }> {
  const result = await draftSupportItemNow(orgId, supportItemId, staffId, opts);
  return result.ok ? { ok: true, draft: result.draft } : result;
}
