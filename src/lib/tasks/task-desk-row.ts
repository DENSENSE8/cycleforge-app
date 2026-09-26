/** The **task desk** view model — one `work_assignments` row as the desk, the phone and the report all read it. */

import {
  taskUrgencyFromPriority,
  type TaskEntityType,
  type TaskUrgency,
} from './task-vocabulary';
import type { TaskLinkFace } from './task-links-shared';

/**
 * `assignment_status_enum`, verbatim. Re-spelled here (not imported from the
 * Drizzle schema) so the client bundle gets the vocabulary without the schema
 * module; `task-desk-row.test.ts` pins it against `assignmentStatusEnum`.
 */
export const TASK_DESK_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'DONE',
  'CANCELED',
] as const;

export type TaskDeskStatus = (typeof TASK_DESK_STATUSES)[number];

export function isTaskDeskStatus(raw: unknown): raw is TaskDeskStatus {
  return typeof raw === 'string' && (TASK_DESK_STATUSES as readonly string[]).includes(raw);
}

/**
 * Statuses a task is still WORK in. `CANCELED` is not open and not done — it
 * is withdrawn, which is why the done lane cannot simply be "not open".
 */
const OPEN_STATUSES: readonly TaskDeskStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

export function isTaskDeskOpen(status: TaskDeskStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Band-1 lanes. `open` is the default, so it IS the unfiltered working list;
 * `done` is the record (and what `/reports` reads); `all` is the audit view
 * that also shows withdrawn rows.
 */
export type TaskDeskLane = 'open' | 'done' | 'all';

export function parseTaskDeskLane(raw: string | null | undefined): TaskDeskLane {
  return raw === 'done' || raw === 'all' ? raw : 'open';
}

/** The statuses a lane reads, or `null` for "every status". */
export function taskDeskLaneStatuses(lane: TaskDeskLane): readonly TaskDeskStatus[] | null {
  if (lane === 'open') return OPEN_STATUSES;
  if (lane === 'done') return ['DONE'];
  return null;
}

/** A staffer as a task row names them — machine id plus the face to paint. */
export interface TaskDeskPerson {
  id: number;
  name: string;
}

/**
 * The paired ticket, when `entityType === 'support_ticket'`. `subject` and
 * `status` are the local caches (`support_tickets.subject_cache` /
 * `status_cache`) — the desk never reaches Zendesk to paint a row.
 */
export interface TaskDeskTicket {
  id: number;
  provider: string;
  subject: string | null;
  status: string | null;
  /** Remote id, when the ticket mirrors one. Never the id to join on. */
  externalId: string | null;
}

/** One assembled task row. */
export interface TaskDeskRow {
  /** `work_assignments.id` — a machine handle, and the only thing column one prints. */
  id: number;
  /** The record this task is about, or null for a standalone task. */
  entityType: TaskEntityType | null;
  entityId: number | null;
  /** Human umbrella label, separate from the instructions in note. */
  projectName: string | null;
  /** `work_assignments.notes` — task instructions an operator typed. */
  note: string;
  status: TaskDeskStatus;
  /** Stored int. Lower sorts first (`idx_work_assignments_assignee`). */
  priority: number;
  /** Derived from {@link priority} once, here. */
  urgency: TaskUrgency;
  assignee: TaskDeskPerson | null;
  /** Ordered members, lead first. */
  assignees: TaskDeskPerson[];
  assignedBy: TaskDeskPerson | null;
  /** When it was handed over (`assigned_at`, NOT NULL). */
  assignedAtMs: number;
  /** "The start date" — `started_at`, null until someone picks it up. */
  startedAtMs: number | null;
  /** "The deadline" — `deadline_at`. */
  deadlineAtMs: number | null;
  completedAtMs: number | null;
  /**
   * "Remind me" — `work_assignments.remind_at`, an absolute instant. The
   * phone apps schedule a LOCAL notification for it from `GET /api/v1/reminders`.
   */
  remindAtMs: number | null;
  ticket: TaskDeskTicket | null;
  /** Every record the task names beyond its anchor (`work_assignment_links`). */
  links: TaskLinkFace[];
  /**
   * Media on the task itself: `WORK_ASSIGNMENT` photos / ready videos PLUS
   * media links of that kind (`work_assignment_media_links`).
   */
  photoCount: number;
  videoCount: number;
  /** Oldest UPLOADED photo — the record's face in the ledger's photo lane (null when only links). */
  coverPhotoId: number | null;
  /** Markdown documents on the task (`work_assignment_documents`). */
  docCount: number;
}

/** The row as it crosses the wire. */
export interface TaskDeskWireRow {
  id: number;
  entityType: TaskEntityType | null;
  entityId: number | null;
  note: string | null;
  projectName: string | null;
  status: string;
  priority: number | null;
  assignee: TaskDeskPerson | null;
  assignees: TaskDeskPerson[];
  assignedBy: TaskDeskPerson | null;
  assignedAt: string;
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  remindAt: string | null;
  ticket: TaskDeskTicket | null;
  links: TaskLinkFace[];
  photoCount: number;
  videoCount: number;
  coverPhotoId: number | null;
  docCount: number;
}

/** The `GET /api/tasks` envelope. */
export interface TaskDeskListPayload {
  ok: boolean;
  count: number;
  tasks: TaskDeskWireRow[];
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

export function taskDeskRowFromWire(wire: TaskDeskWireRow): TaskDeskRow {
  const priority = typeof wire.priority === 'number' ? wire.priority : 100;
  return {
    id: wire.id,
    entityType: wire.entityType,
    entityId: wire.entityId,
    note: (wire.note ?? '').trim(),
    projectName: wire.projectName,
    // An unknown status label is a schema drift, not a row to drop: paint it
    // as OPEN so the operator still sees the work, and let the enum test fail.
    status: isTaskDeskStatus(wire.status) ? wire.status : 'OPEN',
    priority,
    urgency: taskUrgencyFromPriority(priority),
    assignee: wire.assignee,
    assignees: wire.assignees,
    assignedBy: wire.assignedBy,
    assignedAtMs: ms(wire.assignedAt) ?? 0,
    startedAtMs: ms(wire.startedAt),
    deadlineAtMs: ms(wire.deadlineAt),
    completedAtMs: ms(wire.completedAt),
    remindAtMs: ms(wire.remindAt),
    ticket: wire.ticket,
    links: wire.links,
    photoCount: wire.photoCount,
    videoCount: wire.videoCount,
    coverPhotoId: wire.coverPhotoId,
    docCount: wire.docCount,
  };
}

/** Desk order: urgent first, then the nearest deadline, then newest handoff. */
export function sortTaskDeskRows(rows: readonly TaskDeskRow[]): TaskDeskRow[] {
  return [...rows].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aDue = a.deadlineAtMs ?? Number.POSITIVE_INFINITY;
    const bDue = b.deadlineAtMs ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return b.assignedAtMs - a.assignedAtMs;
  });
}

/**
 * The record kind, as an operator names it. A task's subject is printed on
 * four surfaces (slot cell, compound note line, composer, `/m` row) and a
 * fifth spelling of "Carton" is how two of them come to disagree.
 */
export const TASK_DESK_RECORD_NOUN: Readonly<Record<TaskEntityType, string>> = {
  order: 'Order',
  receiving: 'Carton',
  support_ticket: 'Ticket',
};

/**
 * What the href and label helpers need. `ticket` is optional so a caller that
 * only has the two identity fields still type-checks; a ticket task that omits
 * it simply gets the local-id face, which is the honest degradation.
 */
type TaskRecordRef = Pick<TaskDeskRow, 'entityType' | 'entityId'> & {
  ticket?: TaskDeskTicket | null;
};

/** The PROVIDER ticket number for a ticket task — `#48120`, the number an operator quotes — or null when this row has none. */
export function taskDeskTicketNumber(row: TaskRecordRef): number | null {
  if (row.entityType !== 'support_ticket') return null;
  const external = row.ticket?.externalId?.trim();
  if (!external) return null;
  const parsed = Number(external);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * `Ticket 48120` — the record a task is about, in one phrase. Null for a
 * standalone task: there is no record, and a placeholder would read as one.
 */
export function taskDeskRecordLabel(row: TaskRecordRef): string | null {
  if (row.entityType == null || row.entityId == null) return null;
  const noun = TASK_DESK_RECORD_NOUN[row.entityType] ?? 'Record';
  // A ticket is named by the number the operator quotes, not by the registry
  // id they have never seen.
  return `${noun} ${taskDeskTicketNumber(row) ?? row.entityId}`;
}

/**
 * Which app is asking for the door. A phone that follows a desk-only route
 * lands on a surface it cannot run (`SURFACE_LAW` §1), so the caller says
 * where it is and this module answers once.
 */
type TaskDeskSurface = 'desk' | 'phone';

/** The record a task points at, as a route. */
export function taskDeskRecordHref(row: TaskRecordRef, surface: TaskDeskSurface): string | null {
  switch (row.entityType) {
    case 'order':
      return `/dashboard?order=${row.entityId}`;
    case 'receiving':
      return surface === 'phone' ? `/m/r/${row.entityId}` : `/unbox?carton=${row.entityId}`;
    case 'support_ticket': {
      const ticketNumber = taskDeskTicketNumber(row);
      if (ticketNumber == null) return null;
      return surface === 'phone' ? `/m/t/${ticketNumber}` : `/support?ticket=${ticketNumber}`;
    }
    default:
      return null;
  }
}

/** Leading markdown block syntax: heading, quote, bullet / task box, ordered item. */
const MARKDOWN_LINE_LEAD = /^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/;

/** A task's ONE-LINE face — its human project label when present, otherwise the first line of its instructions with markdown syntax removed… */
export function taskDeskTitle(row: TaskRecordRef & { note: string | null; projectName?: string | null }): string {
  const projectName = row.projectName?.trim();
  if (projectName) return projectName;
  for (const raw of (row.note ?? '').split('\n')) {
    const line = raw
      .replace(MARKDOWN_LINE_LEAD, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .trim();
    if (line) return line;
  }
  return taskDeskRecordLabel(row) ?? 'Untitled task';
}
