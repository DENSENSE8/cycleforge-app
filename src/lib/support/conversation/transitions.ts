/**
 * The Support loop's shared transition rules (contract rules 2 + 4), written
 * once against the {@link SupportStore} seam and used by every writer:
 * ingest, reply / mark-sent, item actions and resolve.
 */
import { AUDIT_ACTION } from '@/lib/audit-logs';
import type { TaskFollowUpChannel } from '@/lib/tasks/task-follow-ups-shared';

import { supportResolveBlockers, type SupportNextStep, type SupportResolveBlocker } from './model';
import type { SupportItemRow, SupportStore, SupportTaskRow } from './store';

/**
 * Which pending inbound messages an outbound reply answers: the ones the
 * staffer named (only those still pending), else every pending message that
 * arrived at or before the reply.
 */
export function pickAnsweredInbound(
  pending: readonly { id: number; occurredAt: string }[],
  requested: readonly number[] | null | undefined,
  outboundAt: string,
): number[] {
  if (requested && requested.length > 0) {
    const wanted = new Set(requested);
    return pending.filter((m) => wanted.has(m.id)).map((m) => m.id);
  }
  const cutoff = Date.parse(outboundAt);
  return pending.filter((m) => Date.parse(m.occurredAt) <= cutoff).map((m) => m.id);
}

export interface AnsweringOutboundResult {
  answeredMessageIds: number[];
  pendingInboundCount: number;
  followUpId: number | null;
}

/**
 * Rule 2 for an outbound message that went out (`sent` | `logged`): answer
 * the chosen pending inbound, recount, stamp last_outbound_at and log the
 * task follow-up row for this message (once — unique per message).
 */
export async function applyAnsweringOutbound(
  store: SupportStore,
  args: {
    item: SupportItemRow;
    message: { id: number; occurredAt: string; body: string };
    answersMessageIds?: readonly number[] | null;
    staffId: number | null;
    taskId: number | null;
    contactChannel: TaskFollowUpChannel;
  },
): Promise<AnsweringOutboundResult> {
  const pending = await store.listPendingInbound(args.item.id);
  const answeredMessageIds = pickAnsweredInbound(pending, args.answersMessageIds, args.message.occurredAt);
  await store.markAnswered(answeredMessageIds, args.message.id);
  const pendingInboundCount = await store.recountPending(args.item.id);
  await store.patchItem(args.item.id, { lastOutboundAt: args.message.occurredAt });
  const followUpId =
    args.taskId == null
      ? null
      : await store.logFollowUp({
          taskId: args.taskId,
          staffId: args.staffId,
          channel: args.contactChannel,
          direction: 'outbound',
          occurredAt: args.message.occurredAt,
          body: args.message.body,
          threadMessageId: args.message.id,
          stampLastFollowUp: true,
        });
  return { answeredMessageIds, pendingInboundCount, followUpId };
}

/** The open statuses a hold may sit on. */
function isOpenTask(task: SupportTaskRow): boolean {
  return task.status !== 'DONE' && task.status !== 'CANCELED';
}

export type ResolveInStoreResult =
  | { ok: true; idempotent: boolean; override: boolean; blockers: SupportResolveBlocker[] }
  | { ok: false; status: 409; blockers: SupportResolveBlocker[] }
  | { ok: false; status: 422; error: 'reason_required' };

/**
 * Rule 4: resolve only when nothing is outstanding, or past blockers with an
 * override AND a reason. Task DONE + item resolved + check-in closed + drafts
 * set aside — all on the caller's transaction. Re-resolving is a no-op.
 */
export async function resolveInStore(
  store: SupportStore,
  args: {
    item: SupportItemRow;
    staffId: number | null;
    reason: string | null;
    override: boolean;
    checkInDisposition: 'resolved' | 'no_response_closed' | null;
    nowMs: number;
  },
): Promise<ResolveInStoreResult> {
  const { item } = args;
  if (item.lifecycle === 'resolved') return { ok: true, idempotent: true, override: false, blockers: [] };
  const reason = args.reason?.trim() || null;
  if (args.override && !reason) return { ok: false, status: 422, error: 'reason_required' };

  const task = item.primaryTaskId == null ? null : await store.readTask(item.primaryTaskId);
  const counts = await store.deliveryCounts(item.id);
  const blockers = supportResolveBlockers(
    {
      purpose: item.purpose,
      purposeAcknowledgedAt: item.purposeAcknowledgedAt,
      pendingInboundCount: item.pendingInboundCount,
      nextFollowUpAtMs: task?.nextFollowUpAt ? Date.parse(task.nextFollowUpAt) : null,
      openDeliveryCount: counts.open,
      failedDeliveryCount: counts.failed,
    },
    args.nowMs,
  );
  if (blockers.length > 0 && !(args.override && reason)) return { ok: false, status: 409, blockers };
  const override = blockers.length > 0;

  if (task && isOpenTask(task)) await store.patchTask(task.id, { status: 'DONE' }, args.staffId);
  await store.patchItem(item.id, {
    lifecycle: 'resolved',
    snoozedUntil: null,
    resolution: { byStaffId: args.staffId, reason, override },
  });
  await store.staleDrafts(item.id, 'resolved');
  if (args.checkInDisposition) {
    await store.closeCheckIn(item.id, {
      staffId: args.staffId,
      disposition: args.checkInDisposition,
      reason,
      nowMs: args.nowMs,
    });
  } else {
    await store.refreshCheckIn(item.id, args.staffId, args.nowMs);
  }
  if (task) {
    await store.recordEvent({
      taskId: task.id,
      action: override ? AUDIT_ACTION.SUPPORT_ITEM_RESOLVE_OVERRIDE : AUDIT_ACTION.SUPPORT_ITEM_RESOLVE,
      actorStaffId: args.staffId,
      after: { supportItemId: item.id, reason, blockers, checkInDisposition: args.checkInDisposition },
      ...(override ? { reasonCode: 'SUPPORT_RESOLVE_OVERRIDE' } : {}),
    });
  }
  return { ok: true, idempotent: false, override, blockers };
}

/** Back to open work: lifecycle open, resolution cleared, a DONE task back to To do. */
export async function reopenInStore(
  store: SupportStore,
  args: { item: SupportItemRow; staffId: number | null; cause: 'customer' | 'staff' },
): Promise<void> {
  const { item } = args;
  await store.patchItem(item.id, { lifecycle: 'open', snoozedUntil: null, resolution: null });
  const task = item.primaryTaskId == null ? null : await store.readTask(item.primaryTaskId);
  if (task && task.status === 'DONE') await store.patchTask(task.id, { status: 'OPEN', taskState: null }, args.staffId);
  if (task) {
    await store.recordEvent({
      taskId: task.id,
      action: args.cause === 'customer' ? AUDIT_ACTION.SUPPORT_ITEM_REOPEN : AUDIT_ACTION.SUPPORT_ITEM_LIFECYCLE,
      actorStaffId: args.staffId,
      after: { supportItemId: item.id, lifecycle: 'open' },
    });
  }
}

export type NextStepInput = { kind: SupportNextStep; nextFollowUpAt?: string | null; resolutionReason?: string | null };

export type ApplyNextStepResult =
  | { ok: true; resolve: ResolveInStoreResult | null }
  | { ok: false; status: 400; error: 'next_follow_up_required' | 'invalid_instant' };

/** Refuse a malformed next step BEFORE anything is written or sent. */
export function checkNextStep(step: NextStepInput | null | undefined): { ok: true } | { ok: false; error: 'next_follow_up_required' | 'invalid_instant' } {
  if (!step) return { ok: true };
  if (step.nextFollowUpAt != null && !Number.isFinite(Date.parse(step.nextFollowUpAt))) {
    return { ok: false, error: 'invalid_instant' };
  }
  if (step.kind === 'follow_up_later' && step.nextFollowUpAt == null) return { ok: false, error: 'next_follow_up_required' };
  return { ok: true };
}

/**
 * What happens after a customer reply (or the bare "Waiting on customer" /
 * "Follow up later" action): waiting_customer → lifecycle waiting_customer,
 * task hold PENDING, next chase set or cleared; follow_up_later → hold
 * FOLLOW_UP with the required next chase; resolve → the guarded resolve.
 */
export async function applyNextStep(
  store: SupportStore,
  args: { item: SupportItemRow; step: NextStepInput; staffId: number | null; nowMs: number },
): Promise<ApplyNextStepResult> {
  const check = checkNextStep(args.step);
  if (!check.ok) return { ok: false, status: 400, error: check.error };
  const { item, step } = args;
  const task = item.primaryTaskId == null ? null : await store.readTask(item.primaryTaskId);

  if (step.kind === 'resolve') {
    if (task?.nextFollowUpAt) await store.patchTask(task.id, { nextFollowUpAt: null }, args.staffId);
    const resolve = await resolveInStore(store, {
      item,
      staffId: args.staffId,
      reason: step.resolutionReason ?? null,
      override: false,
      checkInDisposition: null,
      nowMs: args.nowMs,
    });
    return { ok: true, resolve };
  }

  const nextFollowUpAt = step.nextFollowUpAt == null ? null : new Date(Date.parse(step.nextFollowUpAt)).toISOString();
  const hold = step.kind === 'waiting_customer' ? 'PENDING' : 'FOLLOW_UP';
  if (item.lifecycle === 'resolved') await reopenInStore(store, { item, staffId: args.staffId, cause: 'staff' });
  await store.patchItem(item.id, {
    lifecycle: step.kind === 'waiting_customer' ? 'waiting_customer' : 'open',
    snoozedUntil: null,
  });
  if (task) {
    const fresh = (await store.readTask(task.id)) ?? task;
    if (fresh.status !== 'CANCELED' && (fresh.taskState !== hold || fresh.nextFollowUpAt !== nextFollowUpAt)) {
      await store.patchTask(task.id, { taskState: hold, nextFollowUpAt }, args.staffId);
    }
    await store.recordEvent({
      taskId: task.id,
      action: AUDIT_ACTION.SUPPORT_ITEM_NEXT_STEP,
      actorStaffId: args.staffId,
      after: { supportItemId: item.id, nextStep: step.kind, nextFollowUpAt },
    });
  }
  return { ok: true, resolve: null };
}
