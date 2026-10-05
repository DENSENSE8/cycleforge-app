/**
 * Outbound replies on a Support item — Send (connected transport only), Copy &
 * open (stored `copied`, answers nothing until Mark sent), or Log (sent
 * elsewhere, stored `logged`). A reply that went out answers the chosen
 * pending inbound, logs the task follow-up row, marks its draft used and
 * applies the staffer's next step — all in ONE transaction after the send.
 */
import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { OrgId } from '@/lib/tenancy/constants';

import { SUPPORT_MESSAGE_BODY_MAX } from './ingest-core';
import type { DeliveryState, SupportChannel, SupportTransportView } from './model';
import { SupportInputError, type StoredSupportMessage, type SupportItemRow, type SupportStore, type SupportTransaction } from './store';
import {
  applyAnsweringOutbound,
  applyNextStep,
  checkNextStep,
  type NextStepInput,
  type ResolveInStoreResult,
} from './transitions';

export type SupportReplyAction = 'send' | 'copy_open' | 'log';
export type SupportContactChannel = 'message' | 'call' | 'email' | 'note';

export interface RecordSupportReplyInput {
  orgId: OrgId;
  supportItemId: number;
  /** From the auth context. */
  staffId: number | null;
  action: SupportReplyAction;
  body: string;
  answersMessageIds?: number[];
  draftId?: number | null;
  /** How a logged reply went out (default `message`). */
  contactChannel?: SupportContactChannel;
  nextStep?: NextStepInput | null;
  clientEventId: string;
}

export type RecordSupportReplyResult =
  | {
      ok: true;
      messageId: number;
      deliveryState: DeliveryState;
      answeredMessageIds: number[];
      followUpId: number | null;
      idempotent: boolean;
      /** The next step's guarded resolve, when it was asked for (blocked → `ok: false` with blockers). */
      resolve: ResolveInStoreResult | null;
      /** Set when the transport refused the send (the row is stored `failed`). */
      sendError: string | null;
      /** Marketplace policy edits applied to the body. */
      policyChanges: string[];
    }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string };

export interface ReplyDeps {
  transaction: SupportTransaction;
  now: () => number;
  resolveTransport(item: { channel: SupportChannel; externalTicketId: string | null; helpdeskConfigured?: boolean }): SupportTransportView;
  isHelpdeskConnected(orgId: OrgId): Promise<boolean>;
  applyMarketplacePolicy(channel: SupportChannel, body: string): { body: string; changes: string[] };
  sendViaTransport(
    orgId: OrgId,
    args: { channel: SupportChannel; externalTicketId: string | null; body: string; publicReply: boolean; staffId: number | null },
  ): Promise<{ ok: true; externalMessageId: string | null } | { ok: false; error: string }>;
}

function replayed(m: StoredSupportMessage): RecordSupportReplyResult {
  return {
    ok: true,
    messageId: m.id,
    deliveryState: m.deliveryState ?? 'logged',
    answeredMessageIds: [],
    followUpId: null,
    idempotent: true,
    resolve: null,
    sendError: null,
    policyChanges: [],
  };
}

/** The meta a copied reply keeps so Mark sent can finish the loop exactly as the staffer asked. */
interface CopiedReplyMeta {
  answersMessageIds?: number[];
  contactChannel?: SupportContactChannel;
  nextStep?: NextStepInput;
  draftId?: number;
}

/**
 * Rule 2 tail for an outbound row that went out: answers → stale reply drafts
 * → (fresh item read) next step. Shared by a sent/logged reply and Mark sent.
 */
async function finishAnsweringReply(
  store: SupportStore,
  args: {
    item: SupportItemRow;
    message: StoredSupportMessage;
    staffId: number | null;
    answersMessageIds?: readonly number[] | null;
    contactChannel: SupportContactChannel;
    nextStep: NextStepInput | null;
    nowMs: number;
  },
): Promise<{ answeredMessageIds: number[]; followUpId: number | null; resolve: ResolveInStoreResult | null }> {
  const answered = await applyAnsweringOutbound(store, {
    item: args.item,
    message: { id: args.message.id, occurredAt: args.message.occurredAt, body: args.message.body },
    answersMessageIds: args.answersMessageIds,
    staffId: args.staffId,
    taskId: args.item.primaryTaskId,
    contactChannel: args.contactChannel,
  });
  await store.staleDrafts(args.item.id, 'answered', 'reply');
  let resolve: ResolveInStoreResult | null = null;
  if (args.nextStep) {
    const fresh = await store.lockItem(args.item.id);
    if (fresh) {
      const step = await applyNextStep(store, { item: fresh, step: args.nextStep, staffId: args.staffId, nowMs: args.nowMs });
      if (step.ok) resolve = step.resolve;
    }
  }
  await store.refreshCheckIn(args.item.id, args.staffId, args.nowMs);
  return { answeredMessageIds: answered.answeredMessageIds, followUpId: answered.followUpId, resolve };
}

/** The rules half of `recordSupportReply` (./reply binds the real deps). */
export async function recordSupportReplyCore(input: RecordSupportReplyInput, d: ReplyDeps): Promise<RecordSupportReplyResult> {
  const raw = input.body?.trim() ?? '';
  if (!raw) return { ok: false, status: 400, error: 'body must not be empty' };
  if (raw.length > SUPPORT_MESSAGE_BODY_MAX) return { ok: false, status: 400, error: 'body is too long' };
  const step = checkNextStep(input.nextStep);
  if (!step.ok) return { ok: false, status: 400, error: step.error };
  if (!input.clientEventId?.trim()) return { ok: false, status: 400, error: 'clientEventId is required' };

  // Read (and replay-check) BEFORE any provider call — a retried Send never sends twice.
  const pre = await d.transaction(input.orgId, async (store) => ({
    item: await store.lockItem(input.supportItemId),
    replay: await store.findMessageByClientEvent(input.clientEventId),
  }));
  if (!pre.item) return { ok: false, status: 404, error: `Support item ${input.supportItemId} not found` };
  if (pre.replay) {
    if (pre.replay.supportItemId !== input.supportItemId || pre.replay.direction !== 'outbound') {
      return { ok: false, status: 409, error: 'clientEventId already used' };
    }
    return replayed(pre.replay);
  }
  if (pre.item.purpose !== 'customer_conversation') {
    return { ok: false, status: 422, error: 'Customer replies need a Support item acknowledged as a customer conversation.' };
  }

  const channel = pre.item.channel;
  const policy = input.action === 'log' ? { body: raw, changes: [] } : d.applyMarketplacePolicy(channel, raw);
  const body = policy.body.trim();
  if (!body) return { ok: false, status: 422, error: 'Nothing left to send after the marketplace policy.' };

  let delivery: DeliveryState = input.action === 'copy_open' ? 'copied' : 'logged';
  let externalMessageId: string | null = null;
  let sendError: string | null = null;
  if (input.action === 'send') {
    const transport = d.resolveTransport({
      channel,
      externalTicketId: pre.item.externalTicketId,
      helpdeskConfigured: await d.isHelpdeskConnected(input.orgId),
    });
    if (!transport.connected) return { ok: false, status: 409, error: `${transport.label} is not connected — use Copy & open.` };
    const sent = await d.sendViaTransport(input.orgId, {
      channel,
      externalTicketId: pre.item.externalTicketId,
      body,
      publicReply: true,
      staffId: input.staffId,
    });
    if (sent.ok) {
      delivery = 'sent';
      externalMessageId = sent.externalMessageId;
    } else {
      delivery = 'failed';
      sendError = sent.error;
    }
  }

  const nowMs = d.now();
  const contactChannel = input.contactChannel ?? 'message';
  const copiedMeta: CopiedReplyMeta = {
    ...(input.answersMessageIds?.length ? { answersMessageIds: input.answersMessageIds } : {}),
    contactChannel,
    ...(input.nextStep ? { nextStep: input.nextStep } : {}),
    ...(input.draftId != null ? { draftId: input.draftId } : {}),
  };
  const meta: Record<string, unknown> = {
    source: 'staff',
    action: input.action,
    ...copiedMeta,
    ...(policy.changes.length ? { policyChanges: policy.changes } : {}),
  };

  try {
    return await d.transaction(input.orgId, async (store): Promise<RecordSupportReplyResult> => {
      const item = await store.lockItem(input.supportItemId);
      if (!item) return { ok: false, status: 404, error: `Support item ${input.supportItemId} not found` };
      const threadId = await store.ensureThread(item.id, input.staffId);
      let message = await store.insertMessage({
        threadId,
        direction: 'outbound',
        provider: channel,
        visibility: 'public',
        body,
        occurredAt: new Date(nowMs).toISOString(),
        authorStaffId: input.staffId,
        authorLabel: null,
        externalMessageId,
        clientEventId: input.clientEventId,
        replyDisposition: null,
        deliveryState: delivery,
        deliveryError: sendError,
        meta,
      });
      if (!message) {
        // The mirror bridge stored the same provider comment first: adopt it as ours.
        const bridged = externalMessageId ? await store.findMessageByExternal(channel, externalMessageId) : null;
        if (bridged && bridged.supportItemId === item.id) {
          message = await store.adoptOutbound(bridged.id, {
            authorStaffId: input.staffId,
            clientEventId: input.clientEventId,
            deliveryState: delivery,
            meta,
          });
        } else {
          const raced = await store.findMessageByClientEvent(input.clientEventId);
          if (raced && raced.supportItemId === item.id) return replayed(raced);
          throw new SupportInputError(409, 'reply key conflict');
        }
      }

      if (input.draftId != null) await store.markDraftUsed(input.draftId, message.id);

      let finished = { answeredMessageIds: [] as number[], followUpId: null as number | null, resolve: null as ResolveInStoreResult | null };
      if (delivery === 'sent' || delivery === 'logged') {
        finished = await finishAnsweringReply(store, {
          item,
          message,
          staffId: input.staffId,
          answersMessageIds: input.answersMessageIds,
          contactChannel,
          nextStep: input.nextStep ?? null,
          nowMs,
        });
      } else if (item.primaryTaskId != null) {
        // Copied / failed answers nothing; the Timeline still says it happened.
        await store.recordEvent({
          taskId: item.primaryTaskId,
          action: AUDIT_ACTION.SUPPORT_REPLY,
          actorStaffId: input.staffId,
          after: {
            supportItemId: item.id,
            messageId: message.id,
            deliveryState: delivery,
            preview: body.slice(0, 140),
            error: sendError,
          },
        });
      }
      return {
        ok: true,
        messageId: message.id,
        deliveryState: delivery,
        answeredMessageIds: finished.answeredMessageIds,
        followUpId: finished.followUpId,
        idempotent: false,
        resolve: finished.resolve,
        sendError,
        policyChanges: policy.changes,
      };
    });
  } catch (error) {
    if (error instanceof SupportInputError) return { ok: false, status: error.status, error: error.message };
    throw error;
  }
}

export type MarkSupportReplySentResult =
  | { ok: true; idempotent: boolean; answeredMessageIds: number[]; followUpId: number | null; resolve: ResolveInStoreResult | null }
  | { ok: false; status: 404 | 409; error: string };

/** Mark sent after Copy & open: copied → sent, THEN it answers (from the instant it was copied). */
export async function markSupportReplySentCore(
  input: { orgId: OrgId; supportItemId: number; messageId: number; staffId: number | null },
  d: Pick<ReplyDeps, 'transaction' | 'now'>,
): Promise<MarkSupportReplySentResult> {
  return d.transaction(input.orgId, async (store): Promise<MarkSupportReplySentResult> => {
    const item = await store.lockItem(input.supportItemId);
    if (!item) return { ok: false, status: 404, error: `Support item ${input.supportItemId} not found` };
    const message = await store.findMessage(item.id, input.messageId, { lock: true });
    if (!message || message.direction !== 'outbound') return { ok: false, status: 404, error: 'reply not found' };
    if (message.deliveryState === 'sent' || message.deliveryState === 'logged') {
      return { ok: true, idempotent: true, answeredMessageIds: [], followUpId: null, resolve: null };
    }
    if (message.deliveryState !== 'copied') return { ok: false, status: 409, error: `a ${message.deliveryState} reply cannot be marked sent` };

    await store.setDelivery(message.id, 'sent', null);
    const meta = (message.meta ?? {}) as CopiedReplyMeta;
    const finished = await finishAnsweringReply(store, {
      item,
      message: { ...message, deliveryState: 'sent' },
      staffId: input.staffId,
      answersMessageIds: meta.answersMessageIds,
      contactChannel: meta.contactChannel ?? 'message',
      nextStep: meta.nextStep ?? null,
      nowMs: d.now(),
    });
    if (item.primaryTaskId != null) {
      await store.recordEvent({
        taskId: item.primaryTaskId,
        action: AUDIT_ACTION.SUPPORT_REPLY_MARK_SENT,
        actorStaffId: input.staffId,
        after: { supportItemId: item.id, messageId: message.id, answeredMessageIds: finished.answeredMessageIds },
      });
    }
    return { ok: true, idempotent: false, ...finished };
  });
}
