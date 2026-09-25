/**
 * The **Daily agenda** row — one table, two stores, banded by TYPE.
 *
 * Operator 2026-09-22: *"consolidate the tasks into one display just under a
 * type, like type daily checklist and type task."*
 *
 * Daily used to answer its question in two tabs, and a tab is a place you have
 * to already be. What is on my plate today is ONE list: the org's shift
 * checklist and the work a colleague handed me, in one scan, with a band
 * saying which is which. The two stores stay separate — they have genuinely
 * different grains — and only the DISPLAY is merged.
 *
 * | Band | Store | Grain |
 * |---|---|---|
 * | Daily checklist | `daily_check_items` + `daily_check_marks` | per-day attestation, roster denominator, cadence |
 * | Task | `work_assignments` `work_type = 'FOLLOW_UP'` | an assignment with an assigner, a deadline and a priority |
 *
 * ## Why a union row and not two tables stacked
 *
 * Two tables is two column models, two sort vocabularies, two search boxes and
 * two empty states on one page — the fork the one-table law exists to refuse.
 * One binding means one header click sorts the whole agenda and one search box
 * matches both halves.
 *
 * ## Absent facts are NULL, and that is the honest answer
 *
 * A checklist item has no deadline and a task has no roster denominator.
 * Neither side borrows the other's fact to fill a cell: the resolver returns
 * null and the cell dashes, exactly as the compound `fulfillment` track dashes
 * on a family with no order.
 *
 * Pure and dependency-free apart from the task vocabulary, so a client picker
 * imports it without dragging a write path into the browser bundle.
 */

import {
  taskDeskRecordHref,
  taskDeskRecordLabel,
  taskDeskTitle,
  type TaskDeskRow,
  type TaskDeskStatus,
} from '@/lib/tasks/task-desk-row';
import type { TaskUrgency } from '@/lib/tasks/task-vocabulary';
import type { TaskLinkFace } from '@/lib/tasks/task-links-shared';

export type DailyAgendaType = 'checklist' | 'task' | 'ticket';

/**
 * The band captions, in the operator's own words. One declaration: the band
 * header, the Type cell and the composer's type picker all read it, so a
 * rename lands everywhere or nowhere.
 */
export const DAILY_AGENDA_TYPE_LABEL: Readonly<Record<DailyAgendaType, string>> = {
  checklist: 'Daily checklist',
  task: 'Task',
  ticket: 'Ticket',
};

/**
 * Band order: the checklist leads, and the helpdesk lands last.
 *
 * The checklist is the thing every staffer runs at the start of a shift and
 * the thing the page is named after; an assignment is the exception that
 * arrived. Ordering by volume would put whichever band happened to be busier
 * on top and move the list under the operator day to day.
 */
export const DAILY_AGENDA_BAND_ORDER: readonly DailyAgendaType[] = [
  'checklist',
  'task',
  'ticket',
];

/**
 * One agenda row.
 *
 * `key` — not `id` — is the row identity: two stores number their rows
 * independently, so `daily_check_items.id = 7` and `work_assignments.id = 7`
 * would collide into one React key and one selection entry.
 */
export interface DailyAgendaRow {
  /** `<type>:<id>`. The table's row id; never a bare numeric id. */
  key: string;
  type: DailyAgendaType;
  /** The store's own handle. Printed in column one; scoped by {@link type}. */
  id: number;
  title: string;
  /** Did the VIEWER finish it — the state pill, on both halves. */
  done: boolean;

  // ── checklist only ──────────────────────────────────────────────────────
  /** `once` is the exception that must not return tomorrow; null on a task. */
  cadence: 'once' | 'recurring' | null;
  /** How many responsible staff ticked it. */
  teamDone: number | null;
  /** The item's denominator — the roster, or 1 for an assigned one-off. */
  teamTotal: number | null;
  markedAtMs: number | null;
  ownerId: number | null;
  ownerName: string | null;
  /** The staffer's own ordering within the checklist band. */
  sortOrder: number | null;

  // ── task only ───────────────────────────────────────────────────────────
  status: TaskDeskStatus | null;
  urgency: TaskUrgency | null;
  assigneeName: string | null;
  /** NULL on every row written before `assigned_by_staff_id` existed. */
  assignedByName: string | null;
  startedAtMs: number | null;
  deadlineAtMs: number | null;
  completedAtMs: number | null;
  /** `Carton 4412` — the record the task points at. */
  recordLabel: string | null;
  recordHref: string | null;

  // ── schedule (both halves, each in its own grain) ───────────────────────
  /** Checklist only: civil due time `HH:MM` in the warehouse zone. */
  dueTime: string | null;
  /** Checklist only: minutes before {@link dueTime} the phone apps ring. */
  remindOffsetMinutes: number | null;
  /** Task only: the absolute "remind me" instant. */
  remindAtMs: number | null;

  // ── evidence ────────────────────────────────────────────────────────────
  /** Checklist item context; null on a task (its words ARE the title). */
  description: string | null;
  /** Records a task names beyond its anchor; empty on a checklist item. */
  links: readonly TaskLinkFace[];
  photoCount: number;
  videoCount: number;
  /** Markdown documents / plan files attached to a task. */
  docCount: number;
  coverPhotoId: number | null;
  /**
   * Does this row carry a Zendesk ticket anywhere — a ticket task, a task
   * that LINKS a ticket, or a checklist item paired with one. The "Tickets
   * in tasks" tab is the task half of this; the Tickets tab is the band.
   */
  hasTicket: boolean;
}

/**
 * The checklist facts this module reads, declared STRUCTURALLY.
 *
 * `DailyTaskRow` lives in a feature directory and this module is `src/lib`;
 * importing it would be a boundary crossing for a shape, so the shape is named
 * here and the feature's row satisfies it by structure.
 */
export interface ChecklistAgendaSource {
  id: number;
  title: string;
  sortOrder: number;
  kind: 'once' | 'recurring';
  assignedStaffId: number | null;
  assignedStaffName: string | null;
  done: boolean;
  teamDone: number;
  teamTotal: number;
  markedAt: string | null;
  description: string | null;
  ticketId: number | null;
  dueTime: string | null;
  remindOffsetMinutes: number | null;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dailyAgendaFromChecklist(item: ChecklistAgendaSource): DailyAgendaRow {
  return {
    key: `checklist:${item.id}`,
    type: 'checklist',
    id: item.id,
    title: item.title,
    done: item.done,
    cadence: item.kind,
    teamDone: item.teamDone,
    teamTotal: item.teamTotal,
    markedAtMs: ms(item.markedAt),
    ownerId: item.assignedStaffId,
    ownerName: item.assignedStaffName,
    sortOrder: item.sortOrder,
    status: null,
    urgency: null,
    assigneeName: null,
    assignedByName: null,
    startedAtMs: null,
    deadlineAtMs: null,
    completedAtMs: null,
    recordLabel: null,
    recordHref: null,
    dueTime: item.dueTime,
    remindOffsetMinutes: item.remindOffsetMinutes,
    remindAtMs: null,
    description: item.description,
    links: [],
    photoCount: 0,
    videoCount: 0,
    docCount: 0,
    coverPhotoId: null,
    hasTicket: item.ticketId != null,
  };
}

/**
 * Both work bands come from ONE store. `work_assignments` `FOLLOW_UP` is the
 * only place a handed-over job lives; what the TYPE says is which record it
 * points at, and a helpdesk thread is a different job from a carton — it is
 * answered, not walked to. Splitting the store to split the band would have
 * been a second task system, which is exactly what this page consolidated.
 */
export function dailyAgendaFromTask(row: TaskDeskRow): DailyAgendaRow {
  const type: DailyAgendaType = row.entityType === 'support_ticket' ? 'ticket' : 'task';
  return {
    key: `${type}:${row.id}`,
    type,
    id: row.id,
    // A handoff with no words is still a row; it names the record instead of
    // painting an empty title.
    title: taskDeskTitle(row),
    done: row.status === 'DONE',
    cadence: null,
    teamDone: null,
    teamTotal: null,
    markedAtMs: null,
    ownerId: row.assignee?.id ?? null,
    ownerName: row.assignee?.name ?? null,
    sortOrder: null,
    status: row.status,
    urgency: row.urgency,
    assigneeName: row.assignee?.name ?? null,
    assignedByName: row.assignedBy?.name ?? null,
    startedAtMs: row.startedAtMs,
    deadlineAtMs: row.deadlineAtMs,
    completedAtMs: row.completedAtMs,
    recordLabel: taskDeskRecordLabel(row),
    recordHref: taskDeskRecordHref(row, 'desk'),
    dueTime: null,
    remindOffsetMinutes: null,
    remindAtMs: row.remindAtMs,
    description: null,
    links: row.links,
    photoCount: row.photoCount,
    videoCount: row.videoCount,
    docCount: row.docCount,
    coverPhotoId: row.coverPhotoId,
    hasTicket: type === 'ticket' || row.links.some((link) => link.kind === 'ticket'),
  };
}

/**
 * Agenda order WITHIN a band — the bands themselves are ordered by
 * {@link DAILY_AGENDA_BAND_ORDER}.
 *
 * Checklist rows keep the staffer's own `sortOrder`; tasks lead with the
 * urgent ones and then the nearest deadline. A dateless task sorts after every
 * dated peer at the same urgency, because nobody promised a day for it.
 */
export function sortDailyAgendaRows(rows: readonly DailyAgendaRow[]): DailyAgendaRow[] {
  return [...rows].sort((a, b) => {
    if (a.type !== b.type) {
      return DAILY_AGENDA_BAND_ORDER.indexOf(a.type) - DAILY_AGENDA_BAND_ORDER.indexOf(b.type);
    }
    if (a.type === 'checklist') {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id;
    }
    const aUrgent = a.urgency === 'urgent' ? 0 : 1;
    const bUrgent = b.urgency === 'urgent' ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    const aDue = a.deadlineAtMs ?? Number.POSITIVE_INFINITY;
    const bDue = b.deadlineAtMs ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return b.id - a.id;
  });
}

/**
 * The bands a surface hands {@link DataTable}, as `[bandKey, rows][]`.
 *
 * A band with no rows is DROPPED, not painted empty: a "Task" caption over
 * nothing asserts that there is a section to look at. The engine's own empty
 * message covers the case where both are empty.
 */
export function bandDailyAgendaRows(
  rows: readonly DailyAgendaRow[],
): Array<[DailyAgendaType, DailyAgendaRow[]]> {
  return DAILY_AGENDA_BAND_ORDER.map(
    (type) => [type, rows.filter((row) => row.type === type)] as [DailyAgendaType, DailyAgendaRow[]],
  ).filter(([, banded]) => banded.length > 0);
}

/**
 * Is this row WORK handed to a person?
 *
 * Task and Ticket are two bands over ONE store (`work_assignments`
 * `FOLLOW_UP`), so everything that belongs to that store belongs to both: a
 * status, a deadline, a record plane, and an `id` in that store's numbering.
 * Surfaces ask this instead of testing `type === 'task'`, which was true of
 * every work row until the ticket band existed and silently stopped being so.
 */
export function isDailyAgendaWork(row: Pick<DailyAgendaRow, 'type'>): boolean {
  return row.type !== 'checklist';
}
