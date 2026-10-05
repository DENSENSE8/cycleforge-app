/**
 * A task's **Timeline** (owner 2026-09-29, R6): one newest-first stream that
 * merges what was done to chase the task — logged follow-ups (email / call /
 * note, at the operator-set `occurredAt`), the
 * task's own audit (created, owners, status, due) and the follow-up alerts
 * staff sent. Each row carries its `kind` (the board model's glyph + ink) and
 * the staffer who acted. Pure and client-safe: the route and the hooks feed
 * it; the rail (`TaskRailTimeline`) and the phone sheet paint what it returns.
 */

import type { TimelineChange, TimelineItem } from '@/lib/timeline/types';
import { formatMonthDayTimePST } from '@/utils/date';
import type { TaskFollowUp } from './task-follow-ups-shared';
import { TASK_STATUS_FACE, type TaskStatus } from '@/design-system/tokens/task-status';
import { taskStatusFromStored } from './task-status';
import { isSupportTimelineAction, supportTimelineFace, type SupportTimelineFace } from '@/lib/support/conversation/timeline-events';
import { scrubRelayAddresses, supportContactFace } from '@/lib/support/contact-face';

/** Newest rows painted before "Show N earlier events" — the house record limit. */
export const TASK_TIMELINE_INITIAL_LIMIT = 5;

/** One task audit row (`work_task.throw` / `work_task.update`), already read out of its jsonb. */
export interface TaskAuditEntry {
  /** `audit_logs.id`. */
  id: number;
  /** ISO instant the write landed. */
  at: string;
  actorStaffId: number | null;
  /** `created` = the throw; `updated` = a desk edit; `support` = a Support loop event (`support.*`). */
  kind: 'created' | 'updated' | 'support';
  /** The fields the edit carried (`metadata.changed`); empty for a throw. */
  changed: readonly string[];
  /** The task's ONE status before / after (`taskStatusFromStored`); null when the row does not say. */
  statusBefore: TaskStatus | null;
  statusAfter: TaskStatus | null;
  assigneesBefore: readonly number[] | null;
  assigneesAfter: readonly number[] | null;
  /** The task's due instant after this write; `undefined` when the row does not say. */
  deadlineAfter?: string | null;
  /** A `support` row's painted words (`supportTimelineFace`). */
  support?: SupportTimelineFace;
}

/** One follow-up alert sent from the task (`work_task.follow_up_alert` audit row). */
export interface TaskAlertEntry {
  id: number;
  at: string;
  actorStaffId: number | null;
  staffIds: readonly number[];
  note: string | null;
  dueAt: string | null;
}

/** `GET /api/tasks/[id]/timeline` — the audit half of the stream plus the names it mentions. */
export interface TaskTimelinePayload {
  ok: true;
  audit: TaskAuditEntry[];
  alerts: TaskAlertEntry[];
  /** `staff.id` → display name for every actor, owner and alert recipient above. */
  staffNames: Record<number, string>;
}

export interface TaskTimelineInput {
  followUps: readonly TaskFollowUp[];
  audit: readonly TaskAuditEntry[];
  alerts: readonly TaskAlertEntry[];
  staffNames?: Readonly<Record<number, string>>;
}

/** What a row records — the board model maps each kind to its one glyph + ink (`TASK_TIMELINE_KIND_FACE`). */
export const TASK_TIMELINE_KINDS = ['email', 'call', 'note', 'ticket', 'created', 'status', 'owners', 'due', 'alert'] as const;
export type TaskTimelineKind = (typeof TASK_TIMELINE_KINDS)[number];

/** One Timeline row: the generic timeline shape plus the task kind the row's glyph and type word read. */
export type TaskTimelineItem = TimelineItem & { kind: TaskTimelineKind };

/** Tie-break when two rows share an instant: the alert reads first, the audit last. */
const SOURCE_RANK = { alert: 0, followUp: 1, audit: 2 } as const;

/** The words as written (trimmed, blank-line runs folded); the row truncates them, the expanded row wraps them. */
function words(text: string | null | undefined): string | undefined {
  const trimmed = (text ?? '').replace(/\n{3,}/g, '\n\n').trim();
  return trimmed || undefined;
}

function nameOf(staffId: number, names: Readonly<Record<number, string>>): string {
  return names[staffId] ?? `Staff #${staffId}`;
}

function namesOf(ids: readonly number[], names: Readonly<Record<number, string>>): string {
  return ids.length > 0 ? ids.map((id) => nameOf(id, names)).join(', ') : 'nobody';
}

function actorOf(staffId: number | null, names: Readonly<Record<number, string>>) {
  if (staffId == null) return {};
  return { actor: nameOf(staffId, names), actorStaffId: staffId };
}

function dueLabel(iso: string | null): string {
  return iso ? formatMonthDayTimePST(iso) : 'none';
}

function sameMembers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function followUpItem(entry: TaskFollowUp): TaskTimelineItem {
  const inbound = entry.direction === 'inbound';
  // A relay address (`…@members.ebay.com`) paints as its label, never the address.
  const to = supportContactFace({ email: entry.emailTo }).label;
  let title: string;
  let sourceEventType: string;
  switch (entry.channel) {
    case 'email':
      title = inbound ? (to ? `Email from ${to}` : 'Email received') : to ? `Emailed ${to}` : 'Email sent';
      sourceEventType = 'THREAD_MESSAGE';
      break;
    case 'call':
      title = inbound ? 'Call received' : 'Called';
      sourceEventType = inbound ? 'CALL_INBOUND' : 'CALL_OUTBOUND';
      break;
    case 'ticket':
      title = 'Ticket reply';
      sourceEventType = 'TICKET_MESSAGE';
      break;
    case 'note':
      title = 'Note';
      sourceEventType = 'NOTE';
      break;
    case 'message':
      title = inbound ? 'Customer message' : 'Replied to customer';
      sourceEventType = 'THREAD_MESSAGE';
      break;
  }
  const subject = entry.emailSubject?.trim();
  const body = words(entry.body);
  const joined = subject && body ? `${subject} — ${body}` : subject || body;
  const subtitle = joined ? scrubRelayAddresses(joined) : joined;
  return {
    id: `follow-up:${entry.id}`,
    // A Support message wears the ticket glyph — the conversation it belongs to.
    kind: entry.channel === 'message' ? 'ticket' : entry.channel,
    at: entry.occurredAt,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(entry.staffId != null
      ? { actor: entry.staffName ?? `Staff #${entry.staffId}`, actorStaffId: entry.staffId }
      : {}),
    sourceEventType,
  };
}

/**
 * The audit rows as timeline items, oldest → newest so each edit knows the due
 * instant the one before it left (the edit row only snapshots the after-state).
 * An edit that moved nothing the timeline speaks for (priority, note, the chase
 * instant, a same-value write) paints no row.
 */
function auditItems(
  audit: readonly TaskAuditEntry[],
  names: Readonly<Record<number, string>>,
): TaskTimelineItem[] {
  const ordered = [...audit].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id);
  const items: TaskTimelineItem[] = [];
  let knownDeadline: string | null | undefined;

  for (const entry of ordered) {
    const base = { id: `audit:${entry.id}`, at: entry.at, ...actorOf(entry.actorStaffId, names) };
    const priorDeadline = knownDeadline;
    if (entry.deadlineAfter !== undefined) knownDeadline = entry.deadlineAfter;

    if (entry.kind === 'created') {
      const owners = entry.assigneesAfter ?? [];
      items.push({
        ...base,
        kind: 'created',
        title: owners.length > 0 ? `Created for ${namesOf(owners, names)}` : 'Created',
        sourceEventType: 'work_task.throw',
      });
      continue;
    }

    if (entry.kind === 'support') {
      if (!entry.support) continue;
      items.push({
        ...base,
        kind: 'ticket',
        title: entry.support.title,
        ...(entry.support.detail ? { subtitle: entry.support.detail } : {}),
        sourceEventType: 'support',
      });
      continue;
    }

    const changes: TimelineChange[] = [];
    // In status · owners · due order; a multi-field edit wears the first one's glyph.
    const titles: { kind: TaskTimelineKind; title: string }[] = [];

    const { statusBefore, statusAfter } = entry;
    if (statusBefore && statusAfter && statusBefore !== statusAfter) {
      changes.push({ key: 'Status', before: TASK_STATUS_FACE[statusBefore].label, after: TASK_STATUS_FACE[statusAfter].label });
      titles.push({ kind: 'status', title: `Moved to ${TASK_STATUS_FACE[statusAfter].label}` });
    }

    const ownersBefore = entry.assigneesBefore;
    const ownersAfter = entry.assigneesAfter;
    if (ownersBefore && ownersAfter && !sameMembers(ownersBefore, ownersAfter)) {
      const added = ownersAfter.filter((id) => !ownersBefore.includes(id));
      const removed = ownersBefore.filter((id) => !ownersAfter.includes(id));
      changes.push({ key: 'Owners', before: namesOf(ownersBefore, names), after: namesOf(ownersAfter, names) });
      titles.push({
        kind: 'owners',
        title:
          removed.length === 0
            ? `Added ${namesOf(added, names)}`
            : added.length === 0
              ? `Removed ${namesOf(removed, names)}`
              : 'Reassigned',
      });
    }

    if (entry.changed.includes('deadlineAt') && entry.deadlineAfter !== undefined) {
      const after = entry.deadlineAfter;
      if (priorDeadline === undefined) {
        titles.push({ kind: 'due', title: after ? `Due ${dueLabel(after)}` : 'Due date cleared' });
      } else if (priorDeadline !== after) {
        changes.push({ key: 'Due', before: dueLabel(priorDeadline), after: dueLabel(after) });
        titles.push({ kind: 'due', title: after ? `Due ${dueLabel(after)}` : 'Due date cleared' });
      }
    }

    const [first] = titles;
    if (!first) continue;
    items.push({
      ...base,
      kind: first.kind,
      title: titles.length === 1 ? first.title : 'Task updated',
      ...(changes.length > 0 ? { changes } : {}),
      sourceEventType: 'work_task.update',
    });
  }
  return items;
}

function alertItem(entry: TaskAlertEntry, names: Readonly<Record<number, string>>): TaskTimelineItem {
  const note = words(entry.note);
  const due = entry.dueAt ? `Due ${dueLabel(entry.dueAt)}` : undefined;
  const subtitle = [note, due].filter(Boolean).join(' · ');
  return {
    id: `alert:${entry.id}`,
    kind: 'alert',
    at: entry.at,
    title: `Alerted ${namesOf(entry.staffIds, names)} to follow up`,
    ...(subtitle ? { subtitle } : {}),
    ...actorOf(entry.actorStaffId, names),
    sourceEventType: 'work_task.follow_up_alert',
  };
}

function instantMs(at: string | null): number {
  const ms = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * The merged stream, newest first. Ties on the same instant break by source
 * (alert · follow-up · audit), then by the source's own order (newer
 * id first), so the order never depends on the input arrays' order. A row with
 * no parseable instant sinks to the bottom.
 */
export function taskTimelineItems(input: TaskTimelineInput): TaskTimelineItem[] {
  const names = input.staffNames ?? {};
  const ranked: { item: TaskTimelineItem; ms: number; rank: number; seq: number }[] = [];
  const push = (items: readonly TaskTimelineItem[], rank: number) => {
    items.forEach((item, seq) => ranked.push({ item, ms: instantMs(item.at), rank, seq }));
  };

  // Each source is pre-sorted oldest → newest by its own id so `seq` is a stable, input-order-free tie-break.
  push(
    [...input.followUps].sort((a, b) => a.id - b.id).map(followUpItem),
    SOURCE_RANK.followUp,
  );
  push(auditItems([...input.audit].sort((a, b) => a.id - b.id), names), SOURCE_RANK.audit);
  push(
    [...input.alerts].sort((a, b) => a.id - b.id).map((entry) => alertItem(entry, names)),
    SOURCE_RANK.alert,
  );

  ranked.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms === Number.NEGATIVE_INFINITY ? 1 : b.ms === Number.NEGATIVE_INFINITY ? -1 : b.ms - a.ms;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.seq - a.seq;
  });
  return ranked.map(({ item }) => item);
}

/**
 * A row's detail line: the edit as `before → after` (every field, in order),
 * else the words. Line 2 truncates it; the expanded row wraps it in full.
 */
export function taskTimelineDetail(item: TimelineItem): string | null {
  if (item.changes?.length) {
    return item.changes.map((change) => `${change.before ?? '—'} → ${change.after ?? '—'}`).join(' · ');
  }
  return item.subtitle ?? null;
}


/** Raw `audit_logs` row → {@link TaskAuditEntry}; null for a row the timeline cannot read. */
export function taskAuditEntryFromRow(row: {
  id: number | string;
  created_at: string | Date;
  actor_staff_id: number | null;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}): TaskAuditEntry | null {
  const id = Number(row.id);
  const ms = new Date(row.created_at).getTime();
  if (!Number.isFinite(id) || !Number.isFinite(ms)) return null;
  const at = new Date(ms).toISOString();
  const before = row.before_data ?? {};
  const after = row.after_data ?? {};
  const meta = row.metadata ?? {};
  const ids = (raw: unknown): number[] | null =>
    Array.isArray(raw) ? raw.filter((v): v is number => typeof v === 'number' && v > 0) : null;
  const str = (raw: unknown): string | null => (typeof raw === 'string' && raw ? raw : null);

  if (row.action === 'work_task.throw') {
    return {
      id,
      at,
      actorStaffId: row.actor_staff_id,
      kind: 'created',
      changed: [],
      statusBefore: null,
      statusAfter: null,
      assigneesBefore: null,
      assigneesAfter: ids(meta.assigneeStaffIds),
    };
  }
  if (row.action === 'work_task.update') {
    return {
      id,
      at,
      actorStaffId: row.actor_staff_id,
      kind: 'updated',
      changed: Array.isArray(meta.changed) ? meta.changed.filter((v): v is string => typeof v === 'string') : [],
      // Lifecycle + hold → the ONE status, so OPEN → ASSIGNED is no change and a hold reads as its own step.
      statusBefore: taskStatusFromStored(before.status, before.taskState),
      statusAfter: taskStatusFromStored(after.status, after.taskState),
      assigneesBefore: ids(before.assigneeStaffIds),
      assigneesAfter: ids(after.assigneeStaffIds),
      ...('deadlineAt' in after ? { deadlineAfter: str(after.deadlineAt) } : {}),
    };
  }
  if (isSupportTimelineAction(row.action)) {
    const face = supportTimelineFace(row.action, row.after_data);
    if (!face) return null;
    return {
      id,
      at,
      actorStaffId: row.actor_staff_id,
      kind: 'support',
      changed: [],
      statusBefore: null,
      statusAfter: null,
      assigneesBefore: null,
      assigneesAfter: null,
      support: face,
    };
  }
  return null;
}

/** Raw `work_task.follow_up_alert` audit row → {@link TaskAlertEntry}. */
export function taskAlertEntryFromRow(row: {
  id: number | string;
  created_at: string | Date;
  actor_staff_id: number | null;
  after_data: Record<string, unknown> | null;
}): TaskAlertEntry | null {
  const id = Number(row.id);
  const ms = new Date(row.created_at).getTime();
  if (!Number.isFinite(id) || !Number.isFinite(ms)) return null;
  const at = new Date(ms).toISOString();
  const after = row.after_data ?? {};
  const staffIds = Array.isArray(after.staffIds)
    ? after.staffIds.filter((v): v is number => typeof v === 'number' && v > 0)
    : [];
  return {
    id,
    at,
    actorStaffId: row.actor_staff_id,
    staffIds,
    note: typeof after.note === 'string' && after.note.trim() ? after.note : null,
    dueAt: typeof after.dueAt === 'string' && after.dueAt ? after.dueAt : null,
  };
}
