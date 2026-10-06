/**
 * In-memory {@link SupportStore} for the Support loop's unit tests — state you
 * can assert on, and a transaction that rolls back on throw. Test-only.
 */
import type { TaskHold } from '@/design-system/tokens/task-status';
import type { TaskDeskStatus } from '@/lib/tasks/task-desk-row';

import type { SupportPostCommit } from './ingest-core';
import type { CheckInOutcome, SupportDraftKind } from './model';
import type {
  StoredSupportMessage,
  SupportFollowUpInsert,
  SupportItemRow,
  SupportStore,
  SupportTimelineEventInsert,
  SupportTransaction,
} from './store';

export const ORG = '00000000-0000-0000-0000-000000000001';

export interface FakeDraft {
  id: number;
  itemId: number;
  kind: SupportDraftKind;
  status: 'pending' | 'ready' | 'stale' | 'used';
  sourceMessageId: number | null;
  staleReason: string | null;
}

export interface FakeTask {
  id: number;
  supportItemId: number;
  status: TaskDeskStatus;
  taskState: TaskHold | null;
  ownerIds: number[];
  nextFollowUpAt: string | null;
  lastFollowUpAt: string | null;
}

export interface FakeState {
  seq: number;
  items: SupportItemRow[];
  threads: Record<number, number>;
  messages: StoredSupportMessage[];
  tasks: FakeTask[];
  followUps: Array<SupportFollowUpInsert & { id: number }>;
  drafts: FakeDraft[];
  events: SupportTimelineEventInsert[];
  orderLinks: Array<{ itemId: number; orderId: number }>;
  checkInRefreshes: number[];
  checkInCloses: Array<{ itemId: number; disposition: string; outcome: CheckInOutcome | null }>;
  staff: number[];
}

export function emptyState(): FakeState {
  return {
    seq: 100,
    items: [],
    threads: {},
    messages: [],
    tasks: [],
    followUps: [],
    drafts: [],
    events: [],
    orderLinks: [],
    checkInRefreshes: [],
    checkInCloses: [],
    staff: [1, 2, 3],
  };
}

function storeOn(s: FakeState, nowIso: () => string): SupportStore {
  const next = () => ++s.seq;
  const item = (id: number) => s.items.find((i) => i.id === id) ?? null;
  const taskRow = (t: FakeTask) => ({ id: t.id, status: t.status, taskState: t.taskState, ownerIds: [...t.ownerIds], nextFollowUpAt: t.nextFollowUpAt });
  const copy = <T>(v: T): T => structuredClone(v);
  return {
    orgId: ORG,
    async findMessageByClientEvent(key) {
      return copy(s.messages.find((m) => m.clientEventId === key) ?? null);
    },
    async findMessageByExternal(provider, ext) {
      return copy(s.messages.find((m) => m.provider === provider && m.externalMessageId === ext) ?? null);
    },
    async findMessage(itemId, messageId) {
      return copy(s.messages.find((m) => m.id === messageId && m.supportItemId === itemId) ?? null);
    },
    async lockItem(id) {
      return copy(item(id));
    },
    async lockItemByExternal(channel, ext) {
      return copy(s.items.find((i) => i.channel === channel && i.externalTicketId === ext) ?? null);
    },
    async insertItem(a) {
      if (a.externalTicketId && s.items.some((i) => i.channel === a.channel && i.externalTicketId === a.externalTicketId)) return null;
      const row: SupportItemRow = {
        id: next(),
        kind: a.kind,
        channel: a.channel,
        externalTicketId: a.externalTicketId,
        subject: a.subject,
        purpose: a.purpose,
        purposeSource: a.purposeSource,
        purposeAcknowledgedAt: a.purpose === 'unclassified' ? null : nowIso(),
        lifecycle: 'open',
        snoozedUntil: null,
        requesterEmail: a.requesterEmail,
        accountLabel: a.accountLabel,
        primaryTaskId: null,
        pendingInboundCount: 0,
        resolvedAt: null,
      };
      s.items.push(row);
      return copy(row);
    },
    async patchItem(id, p) {
      const it = item(id);
      if (!it) return;
      if (p.purpose !== undefined) it.purpose = p.purpose;
      if (p.purposeSource !== undefined) it.purposeSource = p.purposeSource;
      if (p.purposeAcknowledgedByStaffId !== undefined) it.purposeAcknowledgedAt = nowIso();
      if (p.lifecycle !== undefined) it.lifecycle = p.lifecycle;
      if (p.snoozedUntil !== undefined) it.snoozedUntil = p.snoozedUntil;
      if (p.primaryTaskId !== undefined) it.primaryTaskId = p.primaryTaskId;
      if (p.resolution === null) it.resolvedAt = null;
      else if (p.resolution !== undefined) it.resolvedAt = nowIso();
      if (p.fill?.requesterEmail && !it.requesterEmail) it.requesterEmail = p.fill.requesterEmail;
    },
    async ensureThread(itemId) {
      s.threads[itemId] ??= next();
      return s.threads[itemId];
    },
    async insertMessage(a) {
      const itemId = Number(Object.keys(s.threads).find((k) => s.threads[Number(k)] === a.threadId));
      if (a.clientEventId && s.messages.some((m) => m.clientEventId === a.clientEventId)) return null;
      if (a.externalMessageId && s.messages.some((m) => m.provider === a.provider && m.externalMessageId === a.externalMessageId)) return null;
      const m: StoredSupportMessage = {
        id: next(),
        supportItemId: itemId,
        threadId: a.threadId,
        direction: a.direction,
        provider: a.provider,
        occurredAt: a.occurredAt,
        body: a.body,
        authorStaffId: a.authorStaffId,
        replyDisposition: a.replyDisposition,
        deliveryState: a.deliveryState,
        externalMessageId: a.externalMessageId,
        clientEventId: a.clientEventId,
        meta: a.meta,
      };
      s.messages.push(m);
      return copy(m);
    },
    async adoptOutbound(messageId, a) {
      const m = s.messages.find((x) => x.id === messageId)!;
      m.deliveryState = a.deliveryState;
      m.clientEventId ??= a.clientEventId;
      m.meta = { ...(m.meta ?? {}), ...a.meta };
      return copy(m);
    },
    async setDelivery(messageId, state) {
      const m = s.messages.find((x) => x.id === messageId);
      if (m) m.deliveryState = state;
    },
    async listPendingInbound(itemId) {
      return s.messages
        .filter((m) => m.supportItemId === itemId && m.replyDisposition === 'pending')
        .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id - b.id)
        .map((m) => ({ id: m.id, occurredAt: m.occurredAt }));
    },
    async markAnswered(ids) {
      for (const m of s.messages) if (ids.includes(m.id) && m.replyDisposition === 'pending') m.replyDisposition = 'answered';
    },
    async markNoReplyRequired(id) {
      const m = s.messages.find((x) => x.id === id);
      if (m && m.replyDisposition === 'pending') m.replyDisposition = 'no_reply_required';
    },
    async recountPending(itemId) {
      const n = s.messages.filter((m) => m.supportItemId === itemId && m.replyDisposition === 'pending').length;
      const it = item(itemId);
      if (it) it.pendingInboundCount = n;
      return n;
    },
    async deliveryCounts(itemId) {
      const out = s.messages.filter((m) => m.supportItemId === itemId && m.direction === 'outbound');
      return {
        open: out.filter((m) => m.deliveryState === 'pending' || m.deliveryState === 'copied').length,
        failed: out.filter((m) => m.deliveryState === 'failed').length,
      };
    },
    async readTask(id) {
      const t = s.tasks.find((x) => x.id === id);
      return t ? taskRow(t) : null;
    },
    async insertTask(a) {
      if (a.assigneeStaffIds.some((id) => !s.staff.includes(id))) return null;
      const t: FakeTask = {
        id: next(),
        supportItemId: a.supportItemId,
        status: 'OPEN',
        taskState: null,
        ownerIds: [...a.assigneeStaffIds],
        nextFollowUpAt: null,
        lastFollowUpAt: null,
      };
      s.tasks.push(t);
      return taskRow(t);
    },
    async addTaskOwners(taskId, ids) {
      const t = s.tasks.find((x) => x.id === taskId)!;
      const added = ids.filter((id) => s.staff.includes(id) && !t.ownerIds.includes(id));
      t.ownerIds.push(...added);
      return added;
    },
    async patchTask(taskId, p, actor) {
      const t = s.tasks.find((x) => x.id === taskId)!;
      const before = { status: t.status, taskState: t.taskState };
      if (p.status !== undefined) t.status = p.status;
      if (p.taskState !== undefined) t.taskState = p.taskState;
      if (p.taskState != null && t.status === 'DONE' && p.status === undefined) t.status = 'OPEN';
      if (t.status === 'DONE' || t.status === 'CANCELED') t.taskState = null;
      if (p.nextFollowUpAt !== undefined) t.nextFollowUpAt = p.nextFollowUpAt;
      s.events.push({ taskId, action: 'work_task.update', actorStaffId: actor, before, after: { status: t.status, taskState: t.taskState } });
      return taskRow(t);
    },
    async logFollowUp(a) {
      if (s.followUps.some((f) => f.threadMessageId === a.threadMessageId)) return null;
      const id = next();
      s.followUps.push({ ...a, id });
      const t = s.tasks.find((x) => x.id === a.taskId);
      if (t && a.stampLastFollowUp) t.lastFollowUpAt = a.occurredAt;
      // Mirrors logTaskFollowUpInTx: an outbound chase satisfies a DUE next chase, keeps a future one.
      if (t && a.stampLastFollowUp && a.direction === 'outbound' && t.nextFollowUpAt && Date.parse(t.nextFollowUpAt) <= Date.parse(nowIso())) {
        t.nextFollowUpAt = null;
      }
      return id;
    },
    async linkOrders(itemId, links) {
      for (const l of links) s.orderLinks.push({ itemId, orderId: l.orderId });
    },
    async linkEntities() {},
    async linkPhotos(_itemId, ids) {
      return ids;
    },
    async staleDrafts(itemId, reason, kind) {
      let n = 0;
      for (const d of s.drafts) {
        if (d.itemId === itemId && (d.status === 'pending' || d.status === 'ready') && (!kind || d.kind === kind)) {
          d.status = 'stale';
          d.staleReason = reason;
          n += 1;
        }
      }
      return n;
    },
    async enqueueDraft(itemId, kind, sourceMessageId) {
      const live = s.drafts.find(
        (d) => d.itemId === itemId && d.kind === kind && d.sourceMessageId === sourceMessageId && (d.status === 'pending' || d.status === 'ready'),
      );
      if (live) return null;
      const id = next();
      s.drafts.push({ id, itemId, kind, status: 'pending', sourceMessageId, staleReason: null });
      return id;
    },
    async markDraftUsed(draftId) {
      const d = s.drafts.find((x) => x.id === draftId);
      if (d) d.status = 'used';
    },
    async refreshCheckIn(itemId) {
      s.checkInRefreshes.push(itemId);
    },
    async closeCheckIn(itemId, a) {
      s.checkInCloses.push({ itemId, disposition: a.disposition, outcome: a.outcome });
    },
    async recordEvent(e) {
      s.events.push(e);
    },
  };
}

/** A transaction over `state` (clock = the test's) that restores the snapshot when `fn` throws. */
export function fakeTransaction(state: FakeState, now: () => number): SupportTransaction {
  return async (_orgId, fn) => {
    const snapshot = structuredClone(state);
    try {
      return await fn(storeOn(state, () => new Date(now()).toISOString()));
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  };
}

export interface CapturedPostCommit {
  alerts: Array<{ taskId: number; alertKey: string; note: string }>;
  newTasks: Array<{ taskId: number; assigneeStaffIds: number[] }>;
  drafts: number[];
}

export function fakePostCommit(): { postCommit: SupportPostCommit; cap: CapturedPostCommit } {
  const cap: CapturedPostCommit = { alerts: [], newTasks: [], drafts: [] };
  return {
    cap,
    postCommit: {
      async alert(_orgId, a) {
        cap.alerts.push({ taskId: a.taskId, alertKey: a.alertKey, note: a.note });
      },
      async notifyNewTask(_orgId, a) {
        cap.newTasks.push({ taskId: a.taskId, assigneeStaffIds: a.assigneeStaffIds });
      },
      async processDrafts(_orgId, itemId) {
        cap.drafts.push(itemId);
      },
    },
  };
}
