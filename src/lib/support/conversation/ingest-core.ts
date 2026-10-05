/**
 * `ingestSupportMessage` — the ONE writer waist of the local Support loop.
 * Every transport (Zendesk mirror, marketplace adapters, pasted messages,
 * staff notes, the check-in program, POST /api/support/items) stores a message
 * here: one tenant transaction resolves-or-creates the Support item, its
 * SUPPORT_TICKET thread and its primary task, appends the message idempotently
 * and applies the contract's transition rules. Alerts, assignment notices and
 * the draft worker run AFTER commit (`runAfterCommit`).
 */
import { AUDIT_ACTION } from '@/lib/audit-logs';
import { taskPriorityFor } from '@/lib/tasks/task-vocabulary';
import type { OrgId } from '@/lib/tenancy/constants';

import type { IngestSupportMessageResult, SupportMessageDraft } from './ingest-types';
import { DELIVERY_STATES, SUPPORT_CHANNELS, SUPPORT_MESSAGE_DIRECTIONS, type SupportMessageProvider } from './model';
import { SupportInputError, type StoredSupportMessage, type SupportItemRow, type SupportStore, type SupportTransaction } from './store';
import { applyAnsweringOutbound, reopenInStore } from './transitions';

/** The after-commit effects (real: `supportPostCommit` in ./post-commit). */
export interface SupportPostCommit {
  alert(orgId: OrgId, args: { taskId: number; alertKey: string; note: string; dueAt?: string | null; actorStaffId: number | null }): Promise<void>;
  notifyNewTask(
    orgId: OrgId,
    args: {
      taskId: number;
      supportItemId: number;
      assigneeStaffIds: number[];
      actorStaffId: number | null;
      priority: number;
      note: string | null;
      urgent: boolean;
    },
  ): Promise<void>;
  processDrafts(orgId: OrgId, supportItemId: number): Promise<void>;
}

export interface IngestDeps {
  transaction: SupportTransaction;
  postCommit: SupportPostCommit;
  now: () => number;
  /** Schedules after-commit work; routes pass `after` from next/server. Default: awaited inline. */
  runAfterCommit?: (work: () => Promise<void>) => void;
}

/** Message body cap (thread_messages has none; a pasted email thread can be long, an essay cannot). */
export const SUPPORT_MESSAGE_BODY_MAX = 50_000;

/** The customer-facing preview an alert note carries. */
export function supportMessagePreview(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A new item with no subject is named by its first message: the first non-empty line, ≤120 chars. */
export function supportSubjectFromBody(body: string, max = 120): string | null {
  const line = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Run after-commit work through the caller's scheduler, or inline. */
export async function runSupportAfterCommit(
  deps: Pick<IngestDeps, 'runAfterCommit'>,
  work: Array<() => Promise<void>>,
): Promise<void> {
  if (work.length === 0) return;
  const all = async () => {
    for (const w of work) await w();
  };
  if (deps.runAfterCommit) deps.runAfterCommit(all);
  else await all();
}

type Planned = Extract<IngestSupportMessageResult, { ok: true }> & { afterCommit: Array<() => Promise<void>> };

function messageProvider(draft: SupportMessageDraft): SupportMessageProvider {
  if (draft.direction === 'internal') return draft.source === 'check_in_program' ? 'system' : 'internal';
  return draft.channel;
}

function validate(draft: SupportMessageDraft): string | null {
  if (!(SUPPORT_CHANNELS as readonly string[]).includes(draft.channel)) return `unknown channel "${draft.channel}"`;
  if (!(SUPPORT_MESSAGE_DIRECTIONS as readonly string[]).includes(draft.direction)) return `unknown direction "${draft.direction}"`;
  const body = draft.body?.trim() ?? '';
  if (!body) return 'body must not be empty';
  if (body.length > SUPPORT_MESSAGE_BODY_MAX) return 'body is too long';
  if (draft.occurredAt != null && !Number.isFinite(Date.parse(draft.occurredAt))) return 'occurredAt is not an instant';
  if (draft.delivery !== undefined) {
    if (draft.direction !== 'outbound') return 'delivery is only for outbound messages';
    if (!(DELIVERY_STATES as readonly string[]).includes(draft.delivery)) return `unknown delivery "${draft.delivery}"`;
  }
  if (draft.supportItemId !== undefined && (!Number.isSafeInteger(draft.supportItemId) || draft.supportItemId <= 0)) {
    return 'invalid supportItemId';
  }
  return null;
}

function replayResult(item: SupportItemRow | null, existing: StoredSupportMessage): Planned {
  return {
    ok: true,
    supportItemId: existing.supportItemId,
    threadId: existing.threadId,
    messageId: existing.id,
    taskId: item?.primaryTaskId ?? null,
    createdItem: false,
    createdTask: false,
    reopened: false,
    idempotent: true,
    alertedStaffIds: [],
    draftId: null,
    afterCommit: [],
  };
}

async function findReplay(store: SupportStore, draft: SupportMessageDraft, provider: SupportMessageProvider) {
  if (draft.clientEventId) {
    const hit = await store.findMessageByClientEvent(draft.clientEventId);
    if (hit) return hit;
  }
  if (draft.externalMessageId) return store.findMessageByExternal(provider, draft.externalMessageId);
  return null;
}

type IngestRefusal = Extract<IngestSupportMessageResult, { ok: false }>;

async function ingestInStore(
  store: SupportStore,
  draft: SupportMessageDraft,
  nowMs: number,
  postCommit: SupportPostCommit,
): Promise<Planned | IngestRefusal> {
  const orgId = draft.orgId;
  const live = (draft.mode ?? 'live') === 'live';
  const provider = messageProvider(draft);
  const staffId = draft.authorStaffId ?? null;
  const nowIso = new Date(nowMs).toISOString();
  const occurredAt = draft.occurredAt ? new Date(Date.parse(draft.occurredAt)).toISOString() : nowIso;
  const externalConversationId = draft.externalConversationId?.trim() || null;

  // 1. Idempotency FIRST — a replay touches nothing, not even the item.
  const replay = await findReplay(store, draft, provider);
  if (replay) {
    if (draft.supportItemId !== undefined && replay.supportItemId !== draft.supportItemId) {
      return { ok: false, status: 409, error: 'that message key belongs to another Support item' };
    }
    return replayResult(await store.lockItem(replay.supportItemId), replay);
  }

  // 2. Resolve-or-create the item.
  let item: SupportItemRow | null = null;
  let createdItem = false;
  if (draft.supportItemId !== undefined) {
    item = await store.lockItem(draft.supportItemId);
    if (!item) return { ok: false, status: 404, error: `Support item ${draft.supportItemId} not found` };
  } else if (externalConversationId) {
    item = await store.lockItemByExternal(draft.channel, externalConversationId);
  }
  const requester = draft.requester ?? null;
  if (!item) {
    const purpose = draft.purpose?.value ?? 'unclassified';
    item = await store.insertItem({
      kind: draft.kind ?? 'conversation',
      channel: draft.channel,
      externalTicketId: externalConversationId,
      subject: draft.subject?.trim() || supportSubjectFromBody(draft.body),
      purpose,
      purposeSource: purpose === 'unclassified' ? 'default' : (draft.purpose?.source ?? 'staff'),
      purposeAcknowledgedByStaffId: purpose === 'unclassified' ? null : (draft.purpose?.acknowledgedByStaffId ?? null),
      requesterName: requester?.name?.trim() || null,
      requesterEmail: requester?.email?.trim() || null,
      requesterHandle: requester?.handle?.trim() || null,
      accountLabel: draft.accountLabel?.trim() || null,
      platformId: draft.platformId ?? null,
      platformAccountId: draft.platformAccountId ?? null,
      createdByStaffId: staffId,
    });
    if (item) createdItem = true;
    // A racing writer created the same provider conversation first — append to it.
    else if (externalConversationId) item = await store.lockItemByExternal(draft.channel, externalConversationId);
    if (!item) throw new Error('support item insert conflicted but no item could be locked');
  } else {
    await store.patchItem(item.id, {
      fill: {
        subject: draft.subject?.trim() || null,
        requesterName: requester?.name?.trim() || null,
        requesterEmail: requester?.email?.trim() || null,
        requesterHandle: requester?.handle?.trim() || null,
        accountLabel: draft.accountLabel?.trim() || null,
        platformId: draft.platformId ?? null,
        platformAccountId: draft.platformAccountId ?? null,
      },
    });
    // A program / staff purpose lands only on an item nobody classified yet.
    if (draft.purpose && draft.purpose.value !== 'unclassified' && item.purpose === 'unclassified') {
      await store.patchItem(item.id, {
        purpose: draft.purpose.value,
        purposeSource: draft.purpose.source,
        purposeAcknowledgedByStaffId: draft.purpose.acknowledgedByStaffId,
      });
      item = { ...item, purpose: draft.purpose.value, purposeSource: draft.purpose.source, purposeAcknowledgedAt: nowIso };
    }
  }

  // 3. Thread + message.
  const threadId = await store.ensureThread(item.id, staffId);
  const photoIds = draft.photoIds?.length ? await store.linkPhotos(item.id, [...new Set(draft.photoIds)]) : [];
  const delivery = draft.direction === 'outbound' ? (draft.delivery ?? 'logged') : null;
  const message = await store.insertMessage({
    threadId,
    direction: draft.direction,
    provider,
    visibility: draft.direction === 'internal' ? 'internal' : 'public',
    body: draft.body.trim(),
    occurredAt,
    authorStaffId: staffId,
    authorLabel: draft.authorLabel?.trim() || null,
    externalMessageId: draft.externalMessageId ?? null,
    clientEventId: draft.clientEventId ?? null,
    replyDisposition: draft.direction === 'inbound' ? 'pending' : null,
    deliveryState: delivery,
    deliveryError: null,
    meta: {
      source: draft.source,
      ...(photoIds.length ? { photoIds } : {}),
      ...(draft.answersMessageIds?.length ? { answersMessageIds: draft.answersMessageIds } : {}),
    },
  });
  if (!message) {
    // Lost an idempotency race inside the insert: the winner's row is the answer.
    const winner = await findReplay(store, draft, provider);
    if (!winner) return { ok: false, status: 409, error: 'that message key is already used outside Support' };
    if (createdItem) throw new Error('idempotency race on a freshly created Support item');
    return replayResult(item, winner);
  }

  // 4. Links.
  if (draft.orderLinks?.length) await store.linkOrders(item.id, draft.orderLinks, staffId);
  if (draft.entityLinks?.length) await store.linkEntities(item.id, draft.entityLinks, staffId);

  // 5. Primary task (live only): every new item gets one; an existing item
  //    gets one on a customer message unless it is an internal record.
  const afterCommit: Array<() => Promise<void>> = [];
  let task = item.primaryTaskId == null ? null : await store.readTask(item.primaryTaskId);
  let createdTask = false;
  const wantsTask = createdItem || (draft.direction === 'inbound' && item.purpose !== 'internal_record');
  const assigneeStaffIds = [...new Set(draft.assigneeStaffIds ?? [])];
  if (live && !task && wantsTask) {
    const urgent = draft.task?.urgency === 'urgent';
    const priority = taskPriorityFor(urgent ? 'urgent' : 'normal');
    const note = draft.task?.title?.trim() || null;
    task = await store.insertTask({
      supportItemId: item.id,
      assigneeStaffIds,
      assignedByStaffId: staffId,
      priority,
      note,
      deadlineAt: draft.task?.deadlineAt ? new Date(Date.parse(draft.task.deadlineAt)).toISOString() : null,
    });
    if (!task) throw new SupportInputError(422, 'an assignee is not staff of this organization');
    createdTask = true;
    await store.patchItem(item.id, { primaryTaskId: task.id });
    item = { ...item, primaryTaskId: task.id };
    await store.recordEvent({
      taskId: task.id,
      action: AUDIT_ACTION.WORK_TASK_THROW,
      actorStaffId: staffId,
      after: { supportItemId: item.id },
      extra: {
        targetEntityType: 'support_ticket',
        targetEntityId: item.id,
        assigneeStaffId: assigneeStaffIds[0] ?? null,
        assigneeStaffIds,
        source: draft.source,
      },
    });
    const created = { taskId: task.id, supportItemId: item.id };
    if (assigneeStaffIds.length > 0) {
      afterCommit.push(() =>
        postCommit.notifyNewTask(orgId, {
          ...created,
          assigneeStaffIds,
          actorStaffId: staffId,
          priority,
          note,
          urgent,
        }),
      );
    }
  } else if (task && assigneeStaffIds.length > 0) {
    // Existing owners stay; named ones join.
    await store.addTaskOwners(task.id, assigneeStaffIds);
    task = (await store.readTask(task.id)) ?? task;
  }

  // 6. Transition rules.
  let reopened = false;
  let draftId: number | null = null;
  let alertedStaffIds: number[] = [];
  const priorPending = item.pendingInboundCount;

  if (draft.direction === 'inbound') {
    await store.recountPending(item.id);
    await store.patchItem(item.id, { lastInboundAt: occurredAt });
    if (task) {
      await store.logFollowUp({
        taskId: task.id,
        staffId,
        channel: 'message',
        direction: 'inbound',
        occurredAt,
        body: draft.body.trim(),
        threadMessageId: message.id,
        stampLastFollowUp: false,
      });
    }
    if (live) {
      if (item.lifecycle === 'resolved') {
        if (item.resolvedAt == null || Date.parse(occurredAt) > Date.parse(item.resolvedAt)) {
          await reopenInStore(store, { item, staffId, cause: 'customer' });
          reopened = true;
        }
      } else if (item.lifecycle !== 'open') {
        await store.patchItem(item.id, { lifecycle: 'open', snoozedUntil: null });
        // "Waiting on customer" is over: the customer answered.
        const fresh = task ? await store.readTask(task.id) : null;
        if (fresh && fresh.taskState === 'PENDING') await store.patchTask(fresh.id, { taskState: null }, staffId);
      }
      await store.staleDrafts(item.id, 'new_inbound');
      if (item.purpose === 'customer_conversation') {
        draftId = await store.enqueueDraft(item.id, 'reply', message.id, null);
      }
      if (task && !createdTask) {
        const owners = (await store.readTask(task.id))?.ownerIds ?? task.ownerIds;
        alertedStaffIds = owners.filter((id) => id !== staffId);
        if (alertedStaffIds.length > 0) {
          const lead = priorPending > 0 ? 'Customer followed up' : 'New customer message';
          const note = `${lead} · Support #${item.id} — “${supportMessagePreview(draft.body)}”`;
          const taskId = task.id;
          const alertKey = `support-inbound:${message.id}`;
          afterCommit.push(() => postCommit.alert(orgId, { taskId, alertKey, note, actorStaffId: staffId }));
        }
      }
    }
  } else if (draft.direction === 'outbound') {
    if (delivery === 'sent' || delivery === 'logged') {
      await applyAnsweringOutbound(store, {
        item,
        message: { id: message.id, occurredAt, body: draft.body.trim() },
        answersMessageIds: draft.answersMessageIds,
        staffId,
        taskId: task?.id ?? null,
        contactChannel: 'message',
      });
      await store.staleDrafts(item.id, 'answered', 'reply');
    }
  } else if (task) {
    await store.logFollowUp({
      taskId: task.id,
      staffId,
      channel: 'note',
      direction: 'outbound',
      occurredAt,
      body: draft.body.trim(),
      threadMessageId: message.id,
      stampLastFollowUp: false,
    });
  }

  // A new proactive check-in opens with its check-in draft.
  if (live && createdItem && item.kind === 'post_purchase_check_in' && item.purpose === 'customer_conversation') {
    draftId = (await store.enqueueDraft(item.id, 'check_in', null, null)) ?? draftId;
  }

  await store.refreshCheckIn(item.id, staffId, nowMs);

  if (draftId != null) {
    const itemId = item.id;
    afterCommit.push(() => postCommit.processDrafts(orgId, itemId));
  }

  return {
    ok: true,
    supportItemId: item.id,
    threadId,
    messageId: message.id,
    taskId: task?.id ?? null,
    createdItem,
    createdTask,
    reopened,
    idempotent: false,
    alertedStaffIds,
    draftId,
    afterCommit,
  };
}

/**
 * The rules half of `ingestSupportMessage` (./ingest binds the real deps).
 * Backfill mode stores and answers but never alerts, drafts, creates a task or reopens.
 */
export async function ingestSupportMessageCore(
  draft: SupportMessageDraft,
  d: IngestDeps,
): Promise<IngestSupportMessageResult> {
  const invalid = validate(draft);
  if (invalid) return { ok: false, status: 400, error: invalid };
  let planned: Planned | IngestRefusal;
  try {
    planned = await d.transaction(draft.orgId, (store) => ingestInStore(store, draft, d.now(), d.postCommit));
  } catch (error) {
    if (error instanceof SupportInputError) return { ok: false, status: error.status, error: error.message };
    throw error;
  }
  if (!planned.ok) return planned;
  const { afterCommit, ...result } = planned;
  await runSupportAfterCommit(d, afterCommit);
  return result;
}
