/**
 * The **Tasks** board (`/`, was Daily) — ONE row model over the two work
 * stores: handed-over tasks (`work_assignments`) and the shift checklist
 * (`daily_check_items`). Task-first: the row leads with WHAT needs doing,
 * never the record id; the id is a machine handle the row never prints.
 *
 * Pure: the board, the sidebar panel and the tests all read this module.
 */

import {
  BellRing,
  CalendarClock,
  CircleDot,
  CirclePlus,
  FolderKanban,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquareText,
  NotebookPen,
  Phone,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { addDaysToDateKey, diffDaysDateKey, toPSTDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import {
  isTaskDeskOpen,
  taskDeskRecordHref,
  taskDeskRecordLabel,
  taskDeskTicketNumber,
  taskDeskTitle,
  type TaskDeskPerson,
  type TaskDeskRow,
  type TaskDeskStatus,
} from '@/lib/tasks/task-desk-row';
import { TASK_STATUSES, TASK_STATUS_FACE, isTaskHold, type TaskStatus } from '@/design-system/tokens/task-status';
import { taskStatusOf } from '@/lib/tasks/task-status';
import type { TaskTimelineKind } from '@/lib/tasks/task-timeline';

// ── views (the left pills, `?tab=`) ─────────────────────────────────────────

export const TASK_BOARD_VIEWS = ['all', 'task', 'ticket', 'checklist', 'project'] as const;
export type TaskBoardView = (typeof TASK_BOARD_VIEWS)[number];

/**
 * Owner 2026-09-29: four parents in the house sidebar — All tasks · Support ·
 * Daily checklist · Long-term projects (`sidebar-navigation.ts` home). `task`
 * (standalone work, no ticket) is a saved view under All tasks.
 */
export const TASK_BOARD_VIEW_LABEL: Readonly<Record<TaskBoardView, string>> = {
  all: 'All tasks',
  task: 'Standalone tasks',
  ticket: 'Support',
  checklist: 'Daily checklist',
  project: 'Long-term projects',
};

// ── row type (the glyph each row leads with) ───────────────────────────────

export const TASK_BOARD_ROW_TYPES = ['checklist', 'ticket', 'project', 'task'] as const;
export type TaskBoardRowType = (typeof TASK_BOARD_ROW_TYPES)[number];

/**
 * The ONE type → face map: the row glyph and the sidebar wear the same hue,
 * so Everything sorts checklist vs ticket vs project vs task by colour.
 * `ink` paints the glyph (≥3:1 as a graphic); `text` paints the type WORD on
 * line 2 (≥4.5:1 on the card, WCAG AA for 11px text); `hint` is the hover.
 */
export const TASK_BOARD_TYPE_FACE: Readonly<
  Record<TaskBoardRowType, { icon: LucideIcon; ink: string; text: string; label: string; hint: string }>
> = {
  checklist: {
    icon: ListChecks,
    ink: 'text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    label: 'Daily checklist',
    hint: 'Daily checklist — the team ticks it off each day',
  },
  ticket: {
    icon: Ticket,
    ink: 'text-orange-600 dark:text-orange-400',
    text: 'text-orange-700 dark:text-orange-300',
    label: 'Support',
    hint: 'Support ticket follow-up — a customer is waiting on us',
  },
  project: {
    icon: FolderKanban,
    ink: 'text-indigo-600 dark:text-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-300',
    label: 'Project',
    hint: 'Long-term project work',
  },
  task: {
    icon: ListTodo,
    ink: 'text-violet-600 dark:text-violet-400',
    text: 'text-violet-700 dark:text-violet-300',
    label: 'Task',
    hint: 'A standalone task handed to someone',
  },
};

/** Checklist first (its store), then support work (a ticket or a repair ticket — owner 2026-09-30: repairs are support tickets), then project work, else a task. */
export function taskBoardRowType(row: Pick<TaskBoardRow, 'source' | 'ticket' | 'repair' | 'project'>): TaskBoardRowType {
  if (row.source === 'checklist') return 'checklist';
  if (row.ticket != null || row.repair != null) return 'ticket';
  if (row.project != null) return 'project';
  return 'task';
}

/**
 * The record's Timeline rows wear the same face grammar as the board rows:
 * `ink` paints the glyph (≥3:1), `text` the kind WORD on line 2 (≥4.5:1 on the
 * card and the cursor fill, both themes), `label` is that word. A ticket
 * comment wears the board's own ticket face; a created row the task face.
 */
export const TASK_TIMELINE_KIND_FACE: Readonly<
  Record<TaskTimelineKind, { icon: LucideIcon; ink: string; text: string; label: string }>
> = {
  email: { icon: Mail, ink: 'text-blue-600 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-300', label: 'Email' },
  call: { icon: Phone, ink: 'text-teal-600 dark:text-teal-400', text: 'text-teal-700 dark:text-teal-300', label: 'Call' },
  note: { icon: NotebookPen, ink: 'text-slate-600 dark:text-slate-400', text: 'text-slate-700 dark:text-slate-300', label: 'Note' },
  ticket: {
    icon: MessageSquareText,
    ink: TASK_BOARD_TYPE_FACE.ticket.ink,
    text: TASK_BOARD_TYPE_FACE.ticket.text,
    label: 'Ticket',
  },
  created: { icon: CirclePlus, ink: TASK_BOARD_TYPE_FACE.task.ink, text: TASK_BOARD_TYPE_FACE.task.text, label: 'Created' },
  status: { icon: CircleDot, ink: 'text-amber-600 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-300', label: 'Status' },
  owners: { icon: Users, ink: 'text-cyan-600 dark:text-cyan-400', text: 'text-cyan-700 dark:text-cyan-300', label: 'Owners' },
  due: { icon: CalendarClock, ink: 'text-rose-600 dark:text-rose-400', text: 'text-rose-700 dark:text-rose-300', label: 'Due' },
  alert: { icon: BellRing, ink: 'text-fuchsia-600 dark:text-fuchsia-400', text: 'text-fuchsia-700 dark:text-fuchsia-300', label: 'Alert' },
};

/** `?tab=` → view. Unknown (and the retired `task_ticket`) read as Everything. */
export function parseTaskBoardView(raw: string | null | undefined): TaskBoardView {
  return (TASK_BOARD_VIEWS as readonly string[]).includes(raw ?? '') ? (raw as TaskBoardView) : 'all';
}

/**
 * `?filter=`: Open (every open row, holds included) · Waiting (open rows on a
 * hold — Pending, Follow-up, Blocked: the "who are we waiting on" sweep) ·
 * Done · All.
 */
export const TASK_BOARD_STATUSES = ['open', 'waiting', 'done', 'all'] as const;
export type TaskBoardStatus = (typeof TASK_BOARD_STATUSES)[number];

export function parseTaskBoardStatus(raw: string | null | undefined): TaskBoardStatus {
  return raw === 'waiting' || raw === 'done' || raw === 'all' ? raw : 'open';
}

// ── the row ────────────────────────────────────────────────────────────────

export interface TaskBoardTicket {
  /** Provider number the operator quotes (`#48120`), when known. */
  number: number | null;
  subject: string | null;
  status: string | null;
}

/** The repair a task follows (its REPAIR link) — the board paints its ticket number and status. */
export interface TaskBoardRepair {
  /** `repair_service.id` — the Repair desk opens it (`taskLinkRepairHref`). */
  id: number;
  /** The in-store ticket number stamped on the repair (`8192`, `RS-0037`). */
  ticketNumber: string | null;
  /** Stored `repair_service.status` — `repairStatusFace` paints it. */
  status: string | null;
}

export type TaskBoardSource = 'task' | 'checklist';

export interface TaskBoardRow {
  /** `task:<id>` / `checklist:<id>` — unique across both stores. */
  key: string;
  source: TaskBoardSource;
  id: number;
  /** What needs doing, in the operator's words. */
  title: string;
  /** The rest of the instructions (task) or the item context (checklist). */
  detail: string | null;
  project: string | null;
  done: boolean;
  /** Task status (lifecycle); null on a checklist item. */
  status: TaskDeskStatus | null;
  /** The task's ONE status (`taskStatusOf`, `TASK_STATUS_FACE`); null on a checklist item. */
  taskStatus: TaskStatus | null;
  urgent: boolean;
  /** Who does it, lead first. A checklist item owed by the shift has none. */
  people: readonly TaskDeskPerson[];
  from: TaskDeskPerson | null;
  /** Absolute due instant (task deadline, or today's checklist due time). */
  dueMs: number | null;
  ticket: TaskBoardTicket | null;
  /** Repair-service tasks: the linked repair (ticket number + status). */
  repair: TaskBoardRepair | null;
  /** The record the task is about — `Order 4412` + its door. */
  record: { label: string; href: string | null } | null;
  linkCount: number;
  photoCount: number;
  docCount: number;
  /** Checklist: how many of the shift ticked it. */
  team: { done: number; total: number } | null;
  cadence: 'once' | 'recurring' | null;
  /** When it landed (task) — the tiebreak for "newest first". */
  createdMs: number;
  /** Task: the latest logged follow-up (`work_assignments.last_follow_up_at`). */
  lastFollowUpMs: number | null;
  /** Task: when to chase again (`next_follow_up_at`, operator-set). */
  nextFollowUpMs: number | null;
}

const MARKDOWN_LEAD = /^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/;

function plainLine(raw: string): string {
  return raw
    .replace(MARKDOWN_LEAD, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .trim();
}

/** Everything after the headline, flattened to one readable line. */
function noteRemainder(note: string, title: string): string | null {
  const lines = note.split('\n').map(plainLine).filter(Boolean);
  const rest = lines[0] === title ? lines.slice(1) : lines;
  const text = rest.join(' · ');
  return text || null;
}

export function taskBoardRowFromTask(row: TaskDeskRow): TaskBoardRow {
  // The task leads with its instructions; the project is its own pill.
  const title = taskDeskTitle({ ...row, projectName: null });
  const linkedTicket = row.links.find((link) => link.kind === 'ticket');
  const ticket: TaskBoardTicket | null =
    row.entityType === 'support_ticket'
      ? { number: taskDeskTicketNumber(row), subject: row.ticket?.subject ?? null, status: row.ticket?.status ?? null }
      : linkedTicket
        ? { number: Number(linkedTicket.label.replace(/\D/g, '')) || null, subject: null, status: linkedTicket.status ?? null }
        : null;
  const recordLabel = row.entityType === 'support_ticket' ? null : taskDeskRecordLabel(row);
  const repairFace = row.links.find((link) => link.kind === 'repair' && link.repair)?.repair;
  return {
    key: `task:${row.id}`,
    source: 'task',
    id: row.id,
    title,
    // A repair row already paints its ticket number (RepairChip); the detail keeps the issue.
    detail: noteRemainder(
      repairFace ? row.note.split('\n').filter((line) => !line.startsWith('Repair ticket ')).join('\n') : row.note,
      title,
    ),
    project: row.projectName?.trim() || null,
    done: row.status === 'DONE',
    status: row.status,
    taskStatus: taskStatusOf(row),
    urgent: row.urgency === 'urgent',
    people: row.assignees.length > 0 ? row.assignees : row.assignee ? [row.assignee] : [],
    from: row.assignedBy,
    dueMs: row.deadlineAtMs,
    ticket,
    repair: repairFace ?? null,
    record: recordLabel ? { label: recordLabel, href: taskDeskRecordHref(row, 'desk') } : null,
    linkCount: row.links.length,
    photoCount: row.photoCount + row.videoCount,
    docCount: row.docCount,
    team: null,
    cadence: null,
    createdMs: row.assignedAtMs,
    lastFollowUpMs: row.lastFollowUpAtMs,
    nextFollowUpMs: row.nextFollowUpAtMs,
  };
}

/** The checklist facts this module reads, declared structurally. */
export interface ChecklistBoardSource {
  id: number;
  title: string;
  description: string | null;
  kind: 'once' | 'recurring';
  assignedStaffId: number | null;
  assignedStaffName: string | null;
  done: boolean;
  teamDone: number;
  teamTotal: number;
  ticketId: number | null;
  dueTime: string | null;
}

export function taskBoardRowFromChecklist(item: ChecklistBoardSource, dateKey: string): TaskBoardRow {
  const due = item.dueTime ? warehouseCivilTimeToInstant(dateKey, item.dueTime) : null;
  return {
    key: `checklist:${item.id}`,
    source: 'checklist',
    id: item.id,
    title: item.title,
    detail: item.description?.trim() || null,
    project: null,
    done: item.done,
    status: null,
    taskStatus: null,
    urgent: false,
    people:
      item.assignedStaffId != null
        ? [{ id: item.assignedStaffId, name: item.assignedStaffName ?? 'Staff' }]
        : [],
    from: null,
    dueMs: due ? due.getTime() : null,
    ticket: item.ticketId != null ? { number: item.ticketId, subject: null, status: null } : null,
    repair: null,
    record: null,
    linkCount: 0,
    photoCount: 0,
    docCount: 0,
    team: { done: item.teamDone, total: item.teamTotal },
    cadence: item.kind,
    createdMs: 0,
    lastFollowUpMs: null,
    nextFollowUpMs: null,
  };
}

/** Is this row still work (open), as the board's status filter reads it. */
export function isTaskBoardOpen(row: Pick<TaskBoardRow, 'done' | 'status'>): boolean {
  return row.status ? isTaskDeskOpen(row.status) : !row.done;
}

/**
 * The instant a row next asks for action: the earlier of its due time and
 * its scheduled next follow-up (either may be unset).
 */
export function taskBoardActionMs(row: Pick<TaskBoardRow, 'dueMs' | 'nextFollowUpMs'>): number | null {
  if (row.dueMs == null) return row.nextFollowUpMs;
  if (row.nextFollowUpMs == null) return row.dueMs;
  return Math.min(row.dueMs, row.nextFollowUpMs);
}

/** The default order's key, open/closed aside: urgent first, then soonest action (none sinks), then the newest handoff. */
function compareTaskBoardUrgency(a: TaskBoardRow, b: TaskBoardRow): number {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  const ad = taskBoardActionMs(a) ?? Number.POSITIVE_INFINITY;
  const bd = taskBoardActionMs(b) ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return b.createdMs - a.createdMs;
}

/**
 * Board order: open before closed; then urgent; then soonest action first —
 * due or next follow-up, whichever comes first (none sinks); then the newest
 * handoff.
 */
export function sortTaskBoardRows(rows: readonly TaskBoardRow[]): TaskBoardRow[] {
  return sortTaskBoardRowsBy(rows, 'urgency');
}

// ── display options (`?group=` · `?sort=`) ─────────────────────────────────
// P3 (Linear display options): Group by and Order by are two separate
// controls, remembered per staffer. Grouping never re-sorts: every group
// keeps the order its rows arrived in.

export const TASK_BOARD_GROUP_BYS = ['type', 'status', 'urgency', 'project', 'none'] as const;
export type TaskBoardGroupBy = (typeof TASK_BOARD_GROUP_BYS)[number];

export const TASK_BOARD_GROUP_BY_LABEL: Readonly<Record<TaskBoardGroupBy, string>> = {
  type: 'Type',
  status: 'Status',
  urgency: 'Urgency',
  project: 'Project',
  none: 'No grouping',
};

export const TASK_BOARD_SORTS = ['urgency', 'due', 'status', 'newest'] as const;
export type TaskBoardSort = (typeof TASK_BOARD_SORTS)[number];

export const TASK_BOARD_SORT_LABEL: Readonly<Record<TaskBoardSort, string>> = {
  urgency: 'Urgency',
  due: 'Due date',
  status: 'Status',
  newest: 'Newest',
};

/** `?group=` → grouping; null when absent or unknown (the staffer's remembered choice applies). */
export function parseTaskBoardGroupBy(raw: unknown): TaskBoardGroupBy | null {
  return typeof raw === 'string' && (TASK_BOARD_GROUP_BYS as readonly string[]).includes(raw) ? (raw as TaskBoardGroupBy) : null;
}

/** `?sort=` → order; null when absent or unknown (the staffer's remembered choice applies). */
export function parseTaskBoardSort(raw: unknown): TaskBoardSort | null {
  return typeof raw === 'string' && (TASK_BOARD_SORTS as readonly string[]).includes(raw) ? (raw as TaskBoardSort) : null;
}

/** The row's ONE status: a task's own, a checklist item's To do / Done. */
export function taskBoardRowStatus(row: Pick<TaskBoardRow, 'taskStatus' | 'done'>): TaskStatus {
  return row.taskStatus ?? (row.done ? 'DONE' : 'TODO');
}

const STATUS_RANK: Readonly<Record<TaskStatus, number>> = Object.fromEntries(
  TASK_STATUSES.map((status, index) => [status, index]),
) as Record<TaskStatus, number>;

const SORT_KEY: Readonly<Record<TaskBoardSort, (a: TaskBoardRow, b: TaskBoardRow) => number>> = {
  urgency: () => 0,
  // Undated rows sink; two undated rows tie (never Infinity − Infinity = NaN).
  due: (a, b) => (a.dueMs === b.dueMs ? 0 : a.dueMs == null ? 1 : b.dueMs == null ? -1 : a.dueMs - b.dueMs),
  status: (a, b) => STATUS_RANK[taskBoardRowStatus(a)] - STATUS_RANK[taskBoardRowStatus(b)],
  newest: (a, b) => b.createdMs - a.createdMs,
};

/**
 * Order by: closed rows always sink (the board's rule), then the chosen key,
 * then the urgency order as the tiebreak. `urgency` = urgent first, then the
 * soonest action (P3: important-and-due first) — `sortTaskBoardRows`.
 */
export function sortTaskBoardRowsBy(rows: readonly TaskBoardRow[], sort: TaskBoardSort): TaskBoardRow[] {
  const key = SORT_KEY[sort];
  return [...rows].sort((a, b) => {
    const ao = isTaskBoardOpen(a);
    const bo = isTaskBoardOpen(b);
    if (ao !== bo) return ao ? -1 : 1;
    return key(a, b) || compareTaskBoardUrgency(a, b);
  });
}

/** Urgency is time (P3, Eisenhower): Overdue · Today · Tomorrow · This week · Later · No date; finished work is Closed. */
export const TASK_BOARD_URGENCIES = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'closed'] as const;
export type TaskBoardUrgency = (typeof TASK_BOARD_URGENCIES)[number];

export const TASK_BOARD_URGENCY_LABEL: Readonly<Record<TaskBoardUrgency, string>> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  none: 'No date',
  closed: 'Closed',
};

/**
 * The row's urgency bucket, on warehouse civil dates (never UTC): past its
 * due instant = Overdue; else by the due's Pacific day against today's.
 * "This week" = the next seven days, the same horizon the due face prints a
 * weekday for. A closed row is never overdue.
 */
export function taskBoardUrgency(row: Pick<TaskBoardRow, 'dueMs' | 'done' | 'status'>, nowMs: number): TaskBoardUrgency {
  if (!isTaskBoardOpen(row)) return 'closed';
  if (row.dueMs == null) return 'none';
  if (row.dueMs < nowMs) return 'overdue';
  // `diffDaysDateKey(a, b)` is b − a: today → due, positive ahead.
  const days = diffDaysDateKey(toPSTDateKey(new Date(nowMs)), toPSTDateKey(new Date(row.dueMs))) ?? 0;
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days < 7 ? 'week' : 'later';
}

/** One group of the list: the heading's facts and its rows, in arrival order. */
export interface TaskBoardGroup {
  key: string;
  label: string;
  /** group=type — the heading wears the type's glyph and ink. */
  type?: TaskBoardRowType;
  /** group=status — the heading wears the status pill. */
  status?: TaskStatus;
  /** group=urgency — the heading wears the due inks. */
  urgency?: TaskBoardUrgency;
  /** group=project — the project name; null on the No project group. */
  project?: string | null;
  rows: TaskBoardRow[];
}

/** Type group headings: the sidebar's names, except the ticket group reads as the work it is. */
const TYPE_GROUP_LABEL: Readonly<Record<TaskBoardRowType, string>> = {
  ...TASK_BOARD_VIEW_LABEL,
  ticket: 'Support follow-ups',
};

function bucketed<K extends string>(
  rows: readonly TaskBoardRow[],
  order: readonly K[],
  keyOf: (row: TaskBoardRow) => K,
  face: (key: K) => Omit<TaskBoardGroup, 'rows'>,
): TaskBoardGroup[] {
  const byKey = new Map<K, TaskBoardRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return order.flatMap((key) => {
    const bucket = byKey.get(key);
    return bucket ? [{ ...face(key), rows: bucket }] : [];
  });
}

/**
 * Group by: ordered groups over already-ordered rows; empty groups drop.
 * Type in board order (checklist · Support follow-ups · Long-term projects ·
 * Standalone tasks); status in `TASK_STATUSES` order; urgency in time order;
 * project busiest first, then No project; none = one group.
 */
export function taskBoardGroups(rows: readonly TaskBoardRow[], group: TaskBoardGroupBy, nowMs: number): TaskBoardGroup[] {
  switch (group) {
    case 'none':
      return rows.length > 0 ? [{ key: 'all', label: 'Tasks', rows: [...rows] }] : [];
    case 'type':
      return bucketed(rows, TASK_BOARD_ROW_TYPES, taskBoardRowType, (type) => ({ key: `type:${type}`, label: TYPE_GROUP_LABEL[type], type }));
    case 'status':
      return bucketed(rows, TASK_STATUSES, taskBoardRowStatus, (status) => ({
        key: `status:${status}`,
        label: TASK_STATUS_FACE[status].label,
        status,
      }));
    case 'urgency':
      return bucketed(
        rows,
        TASK_BOARD_URGENCIES,
        (row) => taskBoardUrgency(row, nowMs),
        (urgency) => ({ key: `urgency:${urgency}`, label: TASK_BOARD_URGENCY_LABEL[urgency], urgency }),
      );
    case 'project': {
      const names = taskBoardProjects(rows).map((project) => project.name);
      const seen = new Set(names);
      for (const row of rows) {
        if (row.project && !seen.has(row.project)) {
          seen.add(row.project);
          names.push(row.project);
        }
      }
      names.push('');
      return bucketed(
        rows,
        names,
        (row) => row.project ?? '',
        (name) => ({ key: `project:${name}`, label: name || 'No project', project: name || null }),
      );
    }
  }
}

// ── filtering ──────────────────────────────────────────────────────────────

export function taskBoardViewMatches(row: TaskBoardRow, view: TaskBoardView): boolean {
  switch (view) {
    case 'all':
      return true;
    case 'checklist':
      return row.source === 'checklist';
    case 'task':
      return row.source === 'task' && row.ticket == null && row.repair == null;
    case 'ticket':
      return row.ticket != null || row.repair != null;
    case 'project':
      return row.project != null;
  }
}

export function taskBoardStatusMatches(row: TaskBoardRow, status: TaskBoardStatus): boolean {
  if (status === 'all') return true;
  if (status === 'done') return row.done;
  const open = isTaskBoardOpen(row);
  return status === 'open' ? open : open && row.taskStatus != null && isTaskHold(row.taskStatus);
}

/** Free-text find over everything a row paints (title, detail, people, ticket, record). */
export function taskBoardFindMatches(row: TaskBoardRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.title,
    row.detail ?? '',
    row.project ?? '',
    row.record?.label ?? '',
    row.ticket?.number != null ? `#${row.ticket.number}` : '',
    row.ticket?.subject ?? '',
    row.repair ? `${row.repair.ticketNumber ?? ''} RS-${row.repair.id} ${row.repair.status ?? ''}` : '',
    row.from?.name ?? '',
    ...row.people.map((p) => p.name),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Open count per view — what each sidebar pill promises a click would show. */
export function taskBoardViewCounts(rows: readonly TaskBoardRow[]): Record<TaskBoardView, number> {
  const counts = { all: 0, task: 0, ticket: 0, checklist: 0, project: 0 } satisfies Record<TaskBoardView, number>;
  for (const row of rows) {
    if (!isTaskBoardOpen(row)) continue;
    for (const view of TASK_BOARD_VIEWS) if (taskBoardViewMatches(row, view)) counts[view] += 1;
  }
  return counts;
}

// ── projects ───────────────────────────────────────────────────────────────

export interface TaskBoardProject {
  name: string;
  open: number;
  done: number;
  /** Everyone on any of its tasks, first-seen order. */
  people: TaskDeskPerson[];
  /** Nearest open due instant. */
  nextDueMs: number | null;
  urgent: boolean;
}

/** One summary per project label, busiest first. */
export function taskBoardProjects(rows: readonly TaskBoardRow[]): TaskBoardProject[] {
  const byName = new Map<string, TaskBoardProject>();
  for (const row of rows) {
    if (!row.project || row.status === 'CANCELED') continue;
    const project =
      byName.get(row.project) ??
      { name: row.project, open: 0, done: 0, people: [], nextDueMs: null, urgent: false };
    const open = isTaskBoardOpen(row);
    if (open) {
      project.open += 1;
      if (row.urgent) project.urgent = true;
      if (row.dueMs != null && (project.nextDueMs == null || row.dueMs < project.nextDueMs)) project.nextDueMs = row.dueMs;
    } else if (row.done) {
      project.done += 1;
    }
    for (const person of row.people) {
      if (!project.people.some((p) => p.id === person.id)) project.people.push(person);
    }
    byName.set(row.project, project);
  }
  return [...byName.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

// ── the next step ──────────────────────────────────────────────────────────

export type TaskBoardAction = 'reply' | 'done';

export interface TaskBoardNextStep {
  /** What the operator should do, in their words — the row's call to action. */
  label: string;
  /** The one-click verb the row offers for it. */
  action: TaskBoardAction;
  /** `warn` = someone outside is waiting on us. */
  tone: 'warn' | 'late' | 'calm';
}

/** Helpdesk statuses where the customer spoke last and we owe the reply. */
const TICKET_AWAITING_US = ['new', 'open'];

/**
 * The row's next step, so the operator never has to work out what to do:
 * a ticket the customer is waiting on says Reply; one waiting on the
 * customer says Follow up; late work says so; everything else is Done-able.
 * Null once the row is closed.
 */
export function taskBoardNextStep(row: TaskBoardRow, nowMs: number): TaskBoardNextStep | null {
  if (!isTaskBoardOpen(row)) return null;
  const late = row.dueMs != null && row.dueMs < nowMs;
  if (row.ticket) {
    const status = row.ticket.status?.toLowerCase() ?? null;
    if (status && TICKET_AWAITING_US.includes(status)) return { label: 'Reply to the customer', action: 'reply', tone: 'warn' };
    if (status === 'pending' || status === 'hold') return { label: 'Waiting on customer — follow up', action: 'reply', tone: 'warn' };
    return { label: late ? 'Overdue — follow up on the ticket' : 'Follow up on the ticket', action: 'reply', tone: 'warn' };
  }
  if (late) return { label: 'Overdue', action: 'done', tone: 'late' };
  return null;
}

// ── faces ──────────────────────────────────────────────────────────────────

/**
 * `late` red · `today` and `soon` (tomorrow) orange — owner 2026-09-29:
 * tomorrow must already FEEL urgent — · `calm` default ink.
 */
export type DueTone = 'late' | 'today' | 'soon' | 'calm';

/** `2d late` · `Today 3:00 PM` · `Tomorrow` · `Thu` · `Oct 4` — in the warehouse zone. */
export function taskBoardDueFace(dueMs: number | null, nowMs: number): { label: string; tone: DueTone } | null {
  if (dueMs == null) return null;
  const today = toPSTDateKey(new Date(nowMs));
  const dueKey = toPSTDateKey(new Date(dueMs));
  // `diffDaysDateKey(a, b)` is b − a: today → due, positive ahead (the weekday face holds for the next 7 days only).
  const days = diffDaysDateKey(today, dueKey) ?? 0;
  const time = new Date(dueMs).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (dueMs < nowMs) {
    if (days === 0) return { label: `Late · ${time}`, tone: 'late' };
    return { label: `${Math.abs(days)}d late`, tone: 'late' };
  }
  if (days === 0) return { label: `Today ${time}`, tone: 'today' };
  if (dueKey === addDaysToDateKey(today, 1)) return { label: 'Tomorrow', tone: 'soon' };
  const date = new Date(dueMs);
  if (days < 7) {
    return {
      label: date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }),
      tone: 'calm',
    };
  }
  return {
    label: date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' }),
    tone: 'calm',
  };
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A chase this stale on open work reads orange: someone should nudge again. */
const FOLLOW_UP_STALE_MS = 3 * DAY_MS;

/**
 * Line 2's chase face: the scheduled next follow-up when set (`Chase
 * Tomorrow`, due-tone inks), else the last one logged (`Followed up 2d ago`,
 * orange once it is 3 days stale on open work). Null when neither exists.
 */
export function taskBoardFollowUpFace(
  row: Pick<TaskBoardRow, 'lastFollowUpMs' | 'nextFollowUpMs' | 'done' | 'status'>,
  nowMs: number,
): { label: string; tone: DueTone } | null {
  const open = isTaskBoardOpen(row);
  if (open && row.nextFollowUpMs != null) {
    const due = taskBoardDueFace(row.nextFollowUpMs, nowMs)!;
    return { label: `Chase ${due.label}`, tone: due.tone };
  }
  if (row.lastFollowUpMs == null) return null;
  const age = Math.max(0, nowMs - row.lastFollowUpMs);
  return {
    label: `Followed up ${taskBoardAgo(row.lastFollowUpMs, nowMs)}`,
    tone: open && age >= FOLLOW_UP_STALE_MS ? 'today' : 'calm',
  };
}

/** `just now` · `3h ago` · `2d ago` — the board's one elapsed-time face (line 2 chase, Timeline rows). */
export function taskBoardAgo(atMs: number, nowMs: number): string {
  const age = Math.max(0, nowMs - atMs);
  return age < HOUR_MS ? 'just now' : age < DAY_MS ? `${Math.floor(age / HOUR_MS)}h ago` : `${Math.floor(age / DAY_MS)}d ago`;
}
