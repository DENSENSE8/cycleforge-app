'use client';

/**
 * The open Support item as a query, plus every write the record makes —
 * all against the local `/api/support/items/**` (zero provider reads). Every
 * write settles the bundle and every Support list, so the row's status and
 * flags follow.
 */

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { SUPPORT_LIST_QUERY_KEY } from '@/lib/support/list/use-support-list';
import type {
  DeliveryState,
  SupportDraftView,
  SupportItemBundle,
  SupportItemView,
  SupportNextStep,
  SupportResolveBlocker,
} from '@/lib/support/conversation/model';
import { supportReplyAnswers, type SupportNextStepPatch, type SupportResolveBody } from './support-record-model';
import { closeSupportNextStep, openSupportNextStep } from './next-step-store';

/** A refused Support write: the server's words, plus the resolve blockers when it answered 409 `{ blockers }`. */
export class SupportRequestError extends Error {
  readonly status: number;
  readonly blockers: SupportResolveBlocker[];
  constructor(message: string, status: number, blockers: SupportResolveBlocker[] = []) {
    super(message);
    this.name = 'SupportRequestError';
    this.status = status;
    this.blockers = blockers;
  }
}

async function supportFetch<T>(url: string, init?: { method: 'POST' | 'PATCH'; body: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    ...(init ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    const blockers = Array.isArray(data.blockers) ? (data.blockers as SupportResolveBlocker[]) : [];
    const words =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.reason === 'string' && data.reason) ||
      (blockers.length > 0 ? 'This item still has blockers.' : `Request failed (${res.status})`);
    throw new SupportRequestError(words, res.status, blockers);
  }
  return data as T;
}

/** While a draft is being written server-side the bundle re-reads this often; it stops once none is pending. */
const DRAFTING_POLL_MS = 3_000;

/** The list-row facts that move exactly when the bundle does: a new customer message, an answer, a lifecycle or purpose step. */
function facetsKey(f: Pick<SupportListRow, 'purpose' | 'lifecycle' | 'pendingInboundCount'>): string {
  return `${f.purpose}|${f.lifecycle}|${f.pendingInboundCount}`;
}

/**
 * `GET /api/support/items/[id]` — item, messages, drafts. Polls only while a draft is `pending` (Draft
 * with AI / an inbound message queued one; the server finishes it out of band). And whenever a Support
 * list re-reads, a change in THIS item's row facts re-reads the bundle — so a message that landed from
 * sync or another staffer shows without reopening the record, and an unchanged row costs nothing.
 */
export function useSupportItem(supportItemId: number | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.supportItems.bundle(supportItemId ?? 0),
    enabled: supportItemId != null,
    queryFn: () => supportFetch<SupportItemBundle>(`/api/support/items/${supportItemId}`),
    refetchInterval: (q) => (q.state.data?.drafts.some((d) => d.status === 'pending') ? DRAFTING_POLL_MS : false),
  });

  useEffect(() => {
    if (supportItemId == null) return;
    return queryClient.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (
        event.type !== 'updated' ||
        event.action.type !== 'success' ||
        key[0] !== SUPPORT_LIST_QUERY_KEY[0] ||
        key[1] !== SUPPORT_LIST_QUERY_KEY[1]
      )
        return;
      const rows = (event.query.state.data as { rows?: ReadonlyArray<SupportListRow> } | undefined)?.rows;
      const row = rows?.find((r) => r.itemId === supportItemId);
      const bundle = queryClient.getQueryData<SupportItemBundle>(qk.supportItems.bundle(supportItemId));
      if (!row || !bundle) return;
      if (facetsKey(row) === facetsKey(bundle.item)) return;
      // Every mounted reader of this item hears the same event — join one in-flight read instead of restarting it.
      void queryClient.invalidateQueries({ queryKey: qk.supportItems.bundle(supportItemId) }, { cancelRefetch: false });
    });
  }, [queryClient, supportItemId]);

  return query;
}

/** The reply write's answer (`POST …/replies`). */
export interface SupportReplyResult {
  messageId: number;
  deliveryState: DeliveryState;
  answeredMessageIds: number[];
  followUpId: number | null;
  item: SupportItemView;
}

export type SupportReplyAction = 'send' | 'copy_open' | 'log';

export interface SupportReplyInput {
  action: SupportReplyAction;
  body: string;
  answersMessageIds?: number[];
  draftId?: number;
  contactChannel?: 'message' | 'call' | 'email' | 'note';
  nextStep?: { kind: SupportNextStep; nextFollowUpAt?: string | null; resolutionReason?: string | null };
}

/** Lays a fresh item view over the cached bundle so the header and chips move before the refetch lands. */
function applyItem(queryClient: QueryClient, supportItemId: number, item: SupportItemView | undefined) {
  if (!item) return;
  queryClient.setQueryData<SupportItemBundle>(qk.supportItems.bundle(supportItemId), (prev) => (prev ? { ...prev, item } : prev));
}

/**
 * Callbacks that must run when a write lands even if the caller re-rendered or remounted meanwhile —
 * passed as HOOK-level mutation options (TanStack runs those from the mutation itself; per-`mutate`
 * callbacks are dropped once their observer has no listener).
 */
export interface SupportItemActionHandlers {
  /** A reply was recorded (any action): the composer clears what it sent. */
  onReplied?: (result: SupportReplyResult, input: SupportReplyInput) => void;
  /** An internal note landed: the composer clears it. */
  onInternalAdded?: (body: string) => void;
}

/**
 * Every write on one Support item. `clientEventId` is minted per call so a
 * retried request is a no-op on the server. The next-step choice is owed
 * (`next-step-store`) the moment a write answers the customer — a reply sent
 * or logged, a copy marked sent — and settled by the step or the resolve.
 */
export function useSupportItemActions(supportItemId: number | null, handlers: SupportItemActionHandlers = {}) {
  const queryClient = useQueryClient();
  const base = `/api/support/items/${supportItemId}`;

  const settle = useCallback(
    (item?: SupportItemView) => {
      if (supportItemId == null) return;
      applyItem(queryClient, supportItemId, item);
      void queryClient.invalidateQueries({ queryKey: qk.supportItems.all });
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'desk'] });
    },
    [queryClient, supportItemId],
  );

  const onSettled = useCallback((data: { item?: SupportItemView } | undefined) => settle(data?.item), [settle]);

  /** Staff acknowledgement: "Is this for a customer?" */
  const setPurpose = useMutation({
    mutationFn: (purpose: 'customer_conversation' | 'internal_record') =>
      supportFetch<{ item?: SupportItemView }>(base, { method: 'PATCH', body: { purpose } }),
    onSettled,
  });

  /** Waiting for customer | Follow up later (date). */
  const setNextStep = useMutation({
    mutationFn: (body: SupportNextStepPatch) => supportFetch<{ item?: SupportItemView }>(base, { method: 'PATCH', body }),
    onSuccess: () => {
      if (supportItemId != null) closeSupportNextStep(supportItemId);
    },
    onSettled,
  });

  /** On-hold (snoozed until an instant) | Reopen (back to open — a resolved item reopens). */
  const setLifecycle = useMutation({
    mutationFn: (body: { lifecycle: 'open' } | { lifecycle: 'snoozed'; snoozedUntil: string }) =>
      supportFetch<{ item?: SupportItemView }>(base, { method: 'PATCH', body }),
    onSettled,
  });

  /** An internal note / update on the item. */
  const addInternal = useMutation({
    mutationFn: (body: string) =>
      supportFetch<{ item?: SupportItemView }>(`${base}/messages`, {
        method: 'POST',
        body: { direction: 'internal', body, clientEventId: `support-internal:${safeRandomUUID()}` },
      }),
    onSuccess: (_data, body) => handlers.onInternalAdded?.(body),
    onSettled,
  });

  /**
   * A customer message received elsewhere (eBay page, phone, email, walk-in), pasted in by staff. It lands
   * as an inbound message waiting for our reply — the same path as a synced one (reopens, alerts owners).
   */
  const logInbound = useMutation({
    mutationFn: ({ body, occurredAt }: { body: string; occurredAt: string | null }) =>
      supportFetch<{ item?: SupportItemView }>(`${base}/messages`, {
        method: 'POST',
        body: {
          direction: 'inbound',
          body,
          ...(occurredAt ? { occurredAt } : {}),
          clientEventId: `support-inbound:${safeRandomUUID()}`,
        },
      }),
    onSettled,
  });

  /** Mark sent (after Copy & open) or close an inbound message as needing no reply. */
  const patchMessage = useMutation({
    mutationFn: ({ messageId, body }: { messageId: number; body: { delivery: 'sent' } | { disposition: 'no_reply_required'; reason: string } }) =>
      supportFetch<{ item?: SupportItemView }>(`${base}/messages/${messageId}`, { method: 'PATCH', body }),
    onSuccess: (_data, { body }) => {
      // A copy confirmed sent IS a reply reaching the customer: it answers, so the next step is owed.
      if (supportItemId != null && 'delivery' in body && supportReplyAnswers(body.delivery)) openSupportNextStep(supportItemId);
    },
    onSettled,
  });

  /** Send · Copy & open · Log as sent. */
  const reply = useMutation({
    mutationFn: (input: SupportReplyInput) =>
      supportFetch<SupportReplyResult>(`${base}/replies`, {
        method: 'POST',
        body: { ...input, clientEventId: `support-reply:${safeRandomUUID()}` },
      }),
    onSuccess: (result, input) => {
      if (supportItemId != null && supportReplyAnswers(result.deliveryState)) openSupportNextStep(supportItemId);
      handlers.onReplied?.(result, input);
    },
    onSettled,
  });

  /** Guarded resolve; a 409 carries the blockers in `SupportRequestError.blockers`. */
  const resolve = useMutation({
    mutationFn: (body: SupportResolveBody) => supportFetch<{ item?: SupportItemView }>(`${base}/resolve`, { method: 'POST', body }),
    onSuccess: () => {
      if (supportItemId != null) closeSupportNextStep(supportItemId);
    },
    onSettled,
  });

  /** Draft with AI now / Regenerate — never sends. */
  const draftNow = useMutation({
    mutationFn: (opts?: { stagedPhotoIds?: number[] }) =>
      supportFetch<{ draft: SupportDraftView }>(`${base}/drafts`, { method: 'POST', body: opts ?? {} }),
    onSettled: () => settle(),
  });

  return { setPurpose, setNextStep, setLifecycle, addInternal, logInbound, patchMessage, reply, resolve, draftNow };
}
