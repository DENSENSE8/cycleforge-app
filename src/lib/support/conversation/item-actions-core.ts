/**
 * Staff actions on a Support item that are not a message: purpose
 * acknowledgement, the bare next step (waiting on customer / follow up later),
 * snooze / reopen, and "no reply required" on one inbound message. Each runs
 * in ONE tenant transaction and lands its Timeline row.
 */
import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { OrgId } from '@/lib/tenancy/constants';

import { runSupportAfterCommit, type SupportPostCommit } from './ingest-core';
import type { SupportPurpose } from './model';
import type { SupportTransaction } from './store';
import { applyNextStep, reopenInStore, type NextStepInput } from './transitions';

export interface SupportItemActionDeps {
  transaction: SupportTransaction;
  now: () => number;
  postCommit: Pick<SupportPostCommit, 'processDrafts'>;
  runAfterCommit?: (work: () => Promise<void>) => void;
}

export interface SetSupportPurposeInput {
  orgId: OrgId;
  supportItemId: number;
  staffId: number | null;
  purpose: Exclude<SupportPurpose, 'unclassified'>;
}

export interface SetSupportNextStepInput {
  orgId: OrgId;
  supportItemId: number;
  staffId: number | null;
  step: NextStepInput & { kind: 'waiting_customer' | 'follow_up_later' };
}

export interface SetSupportLifecycleInput {
  orgId: OrgId;
  supportItemId: number;
  staffId: number | null;
  lifecycle: 'snoozed' | 'open';
  snoozedUntil?: string | null;
}

export interface MarkNoReplyRequiredInput {
  orgId: OrgId;
  supportItemId: number;
  messageId: number;
  staffId: number | null;
  reason: string;
}

type ActionRefusal = { ok: false; status: 400 | 404 | 409 | 422; error: string };

function notFound(id: number): ActionRefusal {
  return { ok: false, status: 404, error: `Support item ${id} not found` };
}

export type SetSupportPurposeResult =
  | { ok: true; idempotent: boolean; before: SupportPurpose; after: SupportPurpose; staledDrafts: number; draftId: number | null }
  | ActionRefusal;

/**
 * Staff say who the item is for (owner rule: a suggestion never decides it).
 * Customer → internal sets every live draft aside in the same transaction;
 * acknowledging a customer conversation with unanswered messages queues a draft.
 */
export async function setSupportPurposeCore(
  input: SetSupportPurposeInput,
  d: SupportItemActionDeps,
): Promise<SetSupportPurposeResult> {
  const result = await d.transaction(input.orgId, async (store): Promise<SetSupportPurposeResult> => {
    const item = await store.lockItem(input.supportItemId);
    if (!item) return notFound(input.supportItemId);
    if (item.purpose === input.purpose && item.purposeSource === 'staff') {
      return { ok: true, idempotent: true, before: item.purpose, after: item.purpose, staledDrafts: 0, draftId: null };
    }
    await store.patchItem(item.id, {
      purpose: input.purpose,
      purposeSource: 'staff',
      purposeAcknowledgedByStaffId: input.staffId,
    });
    const staledDrafts = input.purpose === 'internal_record' ? await store.staleDrafts(item.id, 'purpose_internal') : 0;
    let draftId: number | null = null;
    if (input.purpose === 'customer_conversation' && item.lifecycle !== 'resolved') {
      const pending = await store.listPendingInbound(item.id);
      const newest = pending.at(-1);
      if (newest) draftId = await store.enqueueDraft(item.id, 'reply', newest.id, input.staffId);
    }
    if (item.primaryTaskId != null) {
      await store.recordEvent({
        taskId: item.primaryTaskId,
        action: AUDIT_ACTION.SUPPORT_ITEM_PURPOSE,
        actorStaffId: input.staffId,
        before: { purpose: item.purpose, purposeSource: item.purposeSource },
        after: { supportItemId: item.id, purpose: input.purpose, staledDrafts },
      });
    }
    return { ok: true, idempotent: false, before: item.purpose, after: input.purpose, staledDrafts, draftId };
  });
  if (result.ok && result.draftId != null) {
    await runSupportAfterCommit(d, [() => d.postCommit.processDrafts(input.orgId, input.supportItemId)]);
  }
  return result;
}

export type SupportItemStepResult = { ok: true } | ActionRefusal;

/** "Waiting on customer" / "Follow up later" without a reply. */
export async function setSupportNextStepCore(
  input: SetSupportNextStepInput,
  d: Pick<SupportItemActionDeps, 'transaction' | 'now'>,
): Promise<SupportItemStepResult> {
  return d.transaction(input.orgId, async (store): Promise<SupportItemStepResult> => {
    const item = await store.lockItem(input.supportItemId);
    if (!item) return notFound(input.supportItemId);
    const applied = await applyNextStep(store, { item, step: input.step, staffId: input.staffId, nowMs: d.now() });
    if (!applied.ok) return { ok: false, status: 400, error: applied.error };
    await store.refreshCheckIn(item.id, input.staffId, d.now());
    return { ok: true };
  });
}

/** Snooze until an instant, or put the item back to open (reopening resolved work). */
export async function setSupportLifecycleCore(
  input: SetSupportLifecycleInput,
  d: Pick<SupportItemActionDeps, 'transaction' | 'now'>,
): Promise<SupportItemStepResult> {
  const nowMs = d.now();
  let snoozedUntil: string | null = null;
  if (input.lifecycle === 'snoozed') {
    const ms = input.snoozedUntil ? Date.parse(input.snoozedUntil) : Number.NaN;
    if (!Number.isFinite(ms) || ms <= nowMs) return { ok: false, status: 400, error: 'snoozedUntil must be a future instant' };
    snoozedUntil = new Date(ms).toISOString();
  }
  return d.transaction(input.orgId, async (store): Promise<SupportItemStepResult> => {
    const item = await store.lockItem(input.supportItemId);
    if (!item) return notFound(input.supportItemId);
    if (input.lifecycle === 'open') {
      if (item.lifecycle === 'resolved') {
        await reopenInStore(store, { item, staffId: input.staffId, cause: 'staff' });
      } else if (item.lifecycle !== 'open') {
        await store.patchItem(item.id, { lifecycle: 'open', snoozedUntil: null });
        if (item.primaryTaskId != null) {
          await store.recordEvent({
            taskId: item.primaryTaskId,
            action: AUDIT_ACTION.SUPPORT_ITEM_LIFECYCLE,
            actorStaffId: input.staffId,
            after: { supportItemId: item.id, lifecycle: 'open' },
          });
        }
      }
    } else {
      if (item.lifecycle === 'resolved') return { ok: false, status: 409, error: 'a resolved item cannot be snoozed' };
      await store.patchItem(item.id, { lifecycle: 'snoozed', snoozedUntil });
      if (item.primaryTaskId != null) {
        await store.recordEvent({
          taskId: item.primaryTaskId,
          action: AUDIT_ACTION.SUPPORT_ITEM_LIFECYCLE,
          actorStaffId: input.staffId,
          after: { supportItemId: item.id, lifecycle: 'snoozed', snoozedUntil },
        });
      }
    }
    await store.refreshCheckIn(item.id, input.staffId, nowMs);
    return { ok: true };
  });
}

export type MarkNoReplyRequiredResult = { ok: true; idempotent: boolean; pendingInboundCount: number } | ActionRefusal;

/** One inbound message needs no answer — staff + reason, then the pending recount. */
export async function markSupportMessageNoReplyRequiredCore(
  input: MarkNoReplyRequiredInput,
  d: Pick<SupportItemActionDeps, 'transaction' | 'now'>,
): Promise<MarkNoReplyRequiredResult> {
  const reason = input.reason?.trim() ?? '';
  if (!reason) return { ok: false, status: 400, error: 'a reason is required' };
  if (input.staffId == null) return { ok: false, status: 422, error: 'only a staff member can waive a reply' };
  const staffId = input.staffId;
  return d.transaction(input.orgId, async (store): Promise<MarkNoReplyRequiredResult> => {
    const item = await store.lockItem(input.supportItemId);
    if (!item) return notFound(input.supportItemId);
    const message = await store.findMessage(item.id, input.messageId, { lock: true });
    if (!message || message.direction !== 'inbound') return { ok: false, status: 404, error: 'customer message not found' };
    if (message.replyDisposition === 'no_reply_required') {
      return { ok: true, idempotent: true, pendingInboundCount: item.pendingInboundCount };
    }
    if (message.replyDisposition !== 'pending') return { ok: false, status: 409, error: 'that message is already answered' };
    await store.markNoReplyRequired(message.id, staffId, reason);
    const pendingInboundCount = await store.recountPending(item.id);
    if (item.primaryTaskId != null) {
      await store.recordEvent({
        taskId: item.primaryTaskId,
        action: AUDIT_ACTION.SUPPORT_MESSAGE_NO_REPLY,
        actorStaffId: staffId,
        after: { supportItemId: item.id, messageId: message.id, reason },
        reasonCode: 'SUPPORT_NO_REPLY_REQUIRED',
      });
    }
    if (pendingInboundCount === 0) await store.staleDrafts(item.id, 'no_reply_required', 'reply');
    await store.refreshCheckIn(item.id, staffId, d.now());
    return { ok: true, idempotent: false, pendingInboundCount };
  });
}
