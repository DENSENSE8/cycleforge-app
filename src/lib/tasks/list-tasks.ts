/** The **task desk** store — the read path for thrown `FOLLOW_UP` tasks, plus the single-row patch that re-reads through it. */

import { TASK_ASSIGNEES_MAX, TASK_STAFF_ID_MAX } from './create-task-core';
import {
  isTaskDeskOpen,
  isTaskDeskStatus,
  taskDeskLaneStatuses,
  type TaskDeskLane,
  type TaskDeskPerson,
  type TaskDeskStatus,
  type TaskDeskTicket,
  type TaskDeskWireRow,
} from './task-desk-row';
import { parseTaskHold, type TaskHold } from '@/design-system/tokens/task-status';
import {
  TASK_PRIORITY,
  TASK_WORK_TYPE,
  taskEntityEnum,
  taskEntityFromEnum,
} from './task-vocabulary';
import { isTaskLinkKind, TASK_MEDIA_ENTITY_TYPE, type TaskLinkFace } from './task-links-shared';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TicketStatus } from '@/design-system/tokens/ticket-status';

/**
 * Tenant-scoped query seam. The real bindings live in `list-tasks-db.ts` —
 * this module stays free of `server-only` imports so its tests (and any
 * client-side type import) never drag the pool in.
 */
export interface TaskDeskDeps {
  query: (
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

/** The same seam bound to ONE transaction connection, already org-scoped. */
export interface TaskDeskTx {
  query: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

/** A desk page. 200 rows is more than an operator reads; 500 is the ceiling. */
export const TASK_DESK_DEFAULT_LIMIT = 200;
export const TASK_DESK_MAX_LIMIT = 500;

interface ListTaskDeskOptions {
  /** Defaults to `open` — the working list IS the unfiltered default. */
  lane?: TaskDeskLane;
  /** Already resolved: `assignee=me` becomes `ctx.staffId` at the route. */
  assigneeStaffId?: number | null;
  /**
   * The thrower — `assignedBy=me` becomes `ctx.staffId` at the route, so
   * "what I handed off" is one read beside "what I was handed".
   */
  assignedByStaffId?: number | null;
  /** Binary urgency rung, mapped onto the stored `priority` int. */
  urgency?: 'urgent' | 'normal' | null;
  limit?: number;
  /**
   * The desk/report find text, answered in SQL. It searches the visible
   * project label, instructions, record/ticket fields, every member's name,
   * the thrower, status, and linked labels, not just the page already loaded.
   */
  q?: string | null;
  /** Narrow to one row — how the patch re-reads its own result. */
  taskId?: number | null;
  /**
   * Helpdesk statuses (`support_tickets.status_cache`, case-insensitive) —
   * a task passes when its anchor ticket OR any linked ticket is in one of
   * them (several OR together). Empty / absent = no filter.
   */
  ticketStatuses?: readonly TicketStatus[] | null;
}

interface TaskDeskSqlRow {
  id: unknown;
  entity_type: unknown;
  entity_id: unknown;
  notes: unknown;
  project_name: unknown;
  assignees: unknown;
  status: unknown;
  task_state: unknown;
  priority: unknown;
  assignee_staff_id: unknown;
  assignee_name: unknown;
  assigned_by_staff_id: unknown;
  assigned_by_name: unknown;
  assigned_at: unknown;
  started_at: unknown;
  deadline_at: unknown;
  completed_at: unknown;
  remind_at: unknown;
  last_follow_up_at: unknown;
  next_follow_up_at: unknown;
  ticket_id: unknown;
  ticket_provider: unknown;
  ticket_subject: unknown;
  ticket_status: unknown;
  ticket_external_id: unknown;
  links: unknown;
  photo_count: unknown;
  cover_photo_id: unknown;
  video_count: unknown;
  doc_count: unknown;
}

/** ONE statement. */
const TASK_DESK_SQL = `
  SELECT wa.id,
         wa.entity_type::text        AS entity_type,
         wa.entity_id,
         wa.project_name,
         wa.notes,
         wa.status::text             AS status,
         -- Read through the row's JSON so this statement runs before AND after
         -- 2026-09-30_work_assignment_task_state.sql (absent column → NULL).
         to_jsonb(wa) ->> 'task_state' AS task_state,
         wa.priority,
         wa.assignee_staff_id,
         sa.name                     AS assignee_name,
         members.assignees,
         wa.assigned_by_staff_id,
         sb.name                     AS assigned_by_name,
         wa.assigned_at,
         wa.started_at,
         wa.deadline_at,
         wa.completed_at,
         wa.remind_at,
         wa.last_follow_up_at,
         wa.next_follow_up_at,
         st.id                       AS ticket_id,
         st.provider                 AS ticket_provider,
         st.subject_cache            AS ticket_subject,
         st.status_cache             AS ticket_status,
         st.external_ticket_id       AS ticket_external_id,
         lk.links,
         ph.photo_count + ml.photo_link_count AS photo_count,
         ph.cover_photo_id,
         vd.video_count + ml.video_link_count AS video_count,
         dc.doc_count
    FROM work_assignments wa
    LEFT JOIN staff sa
      ON sa.id = wa.assignee_staff_id
     AND sa.organization_id = wa.organization_id
    LEFT JOIN staff sb
      ON sb.id = wa.assigned_by_staff_id
     AND sb.organization_id = wa.organization_id
    LEFT JOIN support_tickets st
      ON wa.entity_type::text = $2
     AND st.id = wa.entity_id
     AND st.organization_id = wa.organization_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', a.staff_id, 'name', COALESCE(ms.name, 'Staff #' || a.staff_id))
                      ORDER BY CASE WHEN a.staff_id = wa.assignee_staff_id THEN 0 ELSE 1 END, a.staff_id) AS assignees
        FROM work_assignment_assignees a
        LEFT JOIN staff ms ON ms.organization_id = a.organization_id AND ms.id = a.staff_id
       WHERE a.organization_id = wa.organization_id AND a.assignment_id = wa.id
    ) members ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object(
                 'kind', CASE l.entity_type
                           WHEN 'ORDER' THEN 'order'
                           WHEN 'TRACKING' THEN 'tracking'
                           WHEN 'SUPPORT_TICKET' THEN 'ticket'
                           WHEN 'REPAIR' THEN 'repair'
                         END,
                 'label', l.label,
                 'status', lt.status_cache,
                 'repair_id', lr.id,
                 'repair_ticket', lr.ticket_number,
                 'repair_status', lr.status)
               ORDER BY l.created_at, l.id) AS links
        FROM work_assignment_links l
        LEFT JOIN support_tickets lt
          ON l.entity_type = 'SUPPORT_TICKET'
         AND lt.id = l.entity_id
         AND lt.organization_id = l.organization_id
        LEFT JOIN repair_service lr
          ON l.entity_type = 'REPAIR'
         AND lr.id = l.entity_id
         AND lr.organization_id = l.organization_id
       WHERE l.organization_id = wa.organization_id
         AND l.assignment_id = wa.id
    ) lk ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT pl.photo_id) AS photo_count,
             MIN(pl.photo_id)            AS cover_photo_id
        FROM photo_entity_links pl
       WHERE pl.organization_id = wa.organization_id
         AND pl.entity_type = $11
         AND pl.entity_id = wa.id
         AND pl.link_role = 'primary'
    ) ph ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS video_count
        FROM entity_videos v
       WHERE v.organization_id = wa.organization_id
         AND v.entity_type = $11
         AND v.entity_id = wa.id
         AND v.status = 'ready'
    ) vd ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE m.kind = 'photo') AS photo_link_count,
             COUNT(*) FILTER (WHERE m.kind = 'video') AS video_link_count
        FROM work_assignment_media_links m
       WHERE m.organization_id = wa.organization_id
         AND m.assignment_id = wa.id
    ) ml ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS doc_count
        FROM work_assignment_documents d
       WHERE d.organization_id = wa.organization_id
         AND d.assignment_id = wa.id
    ) dc ON TRUE
   WHERE wa.organization_id = $1::uuid
     AND wa.work_type::text = $3
     AND ($4::text[] IS NULL OR wa.status::text = ANY($4::text[]))
     AND ($5::int IS NULL OR EXISTS (
       SELECT 1 FROM work_assignment_assignees ma
        WHERE ma.organization_id = wa.organization_id
          AND ma.assignment_id = wa.id AND ma.staff_id = $5))
     AND ($12::int IS NULL OR wa.assigned_by_staff_id = $12)
     AND ($6::int IS NULL OR wa.priority <= $6)
     AND ($7::int IS NULL OR wa.priority > $7)
     AND ($8::bigint IS NULL OR wa.id = $8)
     AND ($13::text[] IS NULL
          OR LOWER(BTRIM(st.status_cache)) = ANY($13::text[])
          OR EXISTS (
               SELECT 1
                 FROM work_assignment_links tl
                 JOIN support_tickets tt
                   ON tt.organization_id = tl.organization_id
                  AND tt.id = tl.entity_id
                WHERE tl.organization_id = wa.organization_id
                  AND tl.assignment_id = wa.id
                  AND tl.entity_type = 'SUPPORT_TICKET'
                  AND LOWER(BTRIM(tt.status_cache)) = ANY($13::text[])))
     AND ($10::text IS NULL OR (
            wa.id::text ILIKE $10
         OR wa.notes ILIKE $10
         OR wa.project_name ILIKE $10
         OR wa.status::text ILIKE $10
         OR (to_jsonb(wa) ->> 'task_state') ILIKE $10
         OR wa.entity_type::text ILIKE $10
         OR sa.name ILIKE $10
         OR sb.name ILIKE $10
         OR EXISTS (
              SELECT 1 FROM work_assignment_assignees qa
              JOIN staff qs ON qs.id = qa.staff_id AND qs.organization_id = qa.organization_id
               WHERE qa.organization_id = wa.organization_id
                 AND qa.assignment_id = wa.id AND qs.name ILIKE $10)
         OR st.subject_cache ILIKE $10
         OR st.external_ticket_id ILIKE $10
         OR EXISTS (
              SELECT 1
                FROM work_assignment_links ql
               WHERE ql.organization_id = wa.organization_id
                 AND ql.assignment_id = wa.id
                 AND ql.label ILIKE $10)
         OR EXISTS (
              SELECT 1
                FROM work_assignment_documents qd
               WHERE qd.organization_id = wa.organization_id
                 AND qd.assignment_id = wa.id
                 AND qd.title ILIKE $10)
         OR EXISTS (
              SELECT 1
                FROM work_assignment_media_links qm
               WHERE qm.organization_id = wa.organization_id
                 AND qm.assignment_id = wa.id
                 AND (qm.title ILIKE $10 OR qm.url ILIKE $10))
        ))
   ORDER BY wa.priority ASC, wa.deadline_at ASC NULLS LAST, wa.assigned_at DESC
   LIMIT $9`;

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTextOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * `json_agg` output → link faces. `pg` parses `json` columns already; a
 * string is tolerated for drivers that do not. A kind outside the vocabulary
 * (a discriminator added in SQL before the TS) is dropped, not guessed.
 */
function linkFaces(value: unknown): TaskLinkFace[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const faces: TaskLinkFace[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !('kind' in item) || !('label' in item)) continue;
    const { kind, label } = item;
    if (!isTaskLinkKind(kind) || typeof label !== 'string') continue;
    // A ticket link carries its ticket's cached status (the board's pill and ticket filter read it);
    // a repair link its repair's number and stored status (the board's repair line).
    if (kind === 'ticket') faces.push({ kind, label, status: 'status' in item ? toTextOrNull(item.status) : null });
    else if (kind === 'repair' && 'repair_id' in item && toIntOrNull(item.repair_id) != null) {
      faces.push({
        kind,
        label,
        repair: {
          id: toIntOrNull(item.repair_id)!,
          ticketNumber: 'repair_ticket' in item ? toTextOrNull(item.repair_ticket) : null,
          status: 'repair_status' in item ? toTextOrNull(item.repair_status) : null,
        },
      });
    } else faces.push({ kind, label });
  }
  return faces;
}

/** A staffer with no readable `staff` row (deleted mid-org-move, or a row that outlived its tenant) still has an id, and the desk must not… */
function person(id: unknown, name: unknown): TaskDeskPerson | null {
  const staffId = toIntOrNull(id);
  if (staffId == null) return null;
  const label = toTextOrNull(name)?.trim();
  return { id: staffId, name: label || `Staff #${staffId}` };
}

function memberFaces(value: unknown, lead: TaskDeskPerson | null): TaskDeskPerson[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!Array.isArray(raw)) return lead ? [lead] : [];
  const members = raw.flatMap((item): TaskDeskPerson[] => {
    if (!item || typeof item !== 'object' || !('id' in item) || !('name' in item)) return [];
    const face = person(item.id, item.name);
    return face ? [face] : [];
  });
  return members.length ? members : lead ? [lead] : [];
}

function ticket(row: TaskDeskSqlRow): TaskDeskTicket | null {
  const id = toIntOrNull(row.ticket_id);
  if (id == null) return null;
  return {
    id,
    provider: toTextOrNull(row.ticket_provider) ?? 'internal',
    subject: toTextOrNull(row.ticket_subject),
    status: toTextOrNull(row.ticket_status),
    externalId: toTextOrNull(row.ticket_external_id),
  };
}

/** `null` when the stored `work_entity_type_enum` label is not in the task vocabulary. */
function mapRow(raw: Record<string, unknown>): TaskDeskWireRow | null {
  const row = raw as unknown as TaskDeskSqlRow;
  // NULL anchor = a standalone task (2026-09-25f). A NON-null label outside
  // the vocabulary is still dropped: its record door would be wrong.
  const standalone = row.entity_type == null;
  const entityType = standalone ? null : taskEntityFromEnum(row.entity_type);
  if (!standalone && !entityType) return null;

  const id = toIntOrNull(row.id);
  const entityId = standalone ? null : toIntOrNull(row.entity_id);
  if (id == null || (!standalone && entityId == null)) return null;

  const assignee = person(row.assignee_staff_id, row.assignee_name);
  return {
    id,
    entityType,
    entityId,
    note: toTextOrNull(row.notes),
    projectName: toTextOrNull(row.project_name),
    status: String(row.status ?? ''),
    taskState: toTextOrNull(row.task_state),
    priority: toIntOrNull(row.priority),
    assignee,
    assignees: memberFaces(row.assignees, assignee),
    assignedBy: person(row.assigned_by_staff_id, row.assigned_by_name),
    assignedAt: toIso(row.assigned_at) ?? new Date(0).toISOString(),
    startedAt: toIso(row.started_at),
    deadlineAt: toIso(row.deadline_at),
    completedAt: toIso(row.completed_at),
    remindAt: toIso(row.remind_at),
    lastFollowUpAt: toIso(row.last_follow_up_at),
    nextFollowUpAt: toIso(row.next_follow_up_at),
    ticket: ticket(row),
    links: linkFaces(row.links),
    photoCount: toIntOrNull(row.photo_count) ?? 0,
    videoCount: toIntOrNull(row.video_count) ?? 0,
    docCount: toIntOrNull(row.doc_count) ?? 0,
    coverPhotoId: toIntOrNull(row.cover_photo_id),
  };
}

export function clampTaskDeskLimit(raw: number | null | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return TASK_DESK_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(raw), 1), TASK_DESK_MAX_LIMIT);
}

/** Urgency rung → the `priority` bounds it means. Mirrors `taskUrgencyFromPriority`. */
function priorityBounds(urgency: ListTaskDeskOptions['urgency']): {
  atMost: number | null;
  above: number | null;
} {
  if (urgency === 'urgent') return { atMost: TASK_PRIORITY.urgent, above: null };
  if (urgency === 'normal') return { atMost: null, above: TASK_PRIORITY.urgent };
  return { atMost: null, above: null };
}

function positiveIntOrNull(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && raw > 0 ? Math.floor(raw) : null;
}

export async function listTaskDeskRows(
  orgId: OrgId,
  opts: ListTaskDeskOptions,
  deps: TaskDeskDeps,
): Promise<TaskDeskWireRow[]> {
  const lane: TaskDeskLane = opts.lane ?? 'open';
  const laneStatuses = taskDeskLaneStatuses(lane);
  const assigneeStaffId = positiveIntOrNull(opts.assigneeStaffId);
  const assignedByStaffId = positiveIntOrNull(opts.assignedByStaffId);
  const taskId = positiveIntOrNull(opts.taskId);
  const { atMost, above } = priorityBounds(opts.urgency ?? null);
  const q = opts.q?.trim() || null;
  const ticketStatuses = opts.ticketStatuses?.length ? [...opts.ticketStatuses] : null;

  // A SEARCH IS NOT A PAGE.
  const result = await deps.query(orgId, TASK_DESK_SQL, [
    orgId,
    taskEntityEnum('support_ticket'),
    TASK_WORK_TYPE,
    laneStatuses ? [...laneStatuses] : null,
    assigneeStaffId,
    atMost,
    above,
    taskId,
    clampTaskDeskLimit(q ? TASK_DESK_MAX_LIMIT : opts.limit),
    q ? `%${q}%` : null,
    TASK_MEDIA_ENTITY_TYPE,
    assignedByStaffId,
    ticketStatuses,
  ]);

  const rows: TaskDeskWireRow[] = [];
  for (const raw of result.rows) {
    const mapped = mapRow(raw);
    if (mapped) rows.push(mapped);
  }
  return rows;
}

// ── patch ───────────────────────────────────────────────────────────────────

/** The PATCH allowlist, as a type. The route's Zod schema is its mirror. */
export interface TaskDeskPatch {
  status?: TaskDeskStatus;
  /**
   * `work_assignments.task_state` — the hold on OPEN work, null clears it.
   * Closing a task clears it in the database (trigger), so a status write
   * never has to name it.
   */
  taskState?: TaskHold | null;
  priority?: number;
  deadlineAt?: string | null;
  startedAt?: string | null;
  assigneeStaffId?: number;
  assigneeStaffIds?: number[];
  projectName?: string | null;
  /** `work_assignments.notes`. Trimmed here; empty or null clears it. */
  note?: string | null;
  /** `work_assignments.remind_at` — an absolute instant, null clears it. */
  remindAt?: string | null;
  /** `work_assignments.next_follow_up_at` — when to chase next, null clears it. */
  nextFollowUpAt?: string | null;
}

/** What the row looked like before the patch — the audit row's `before`. */
export interface TaskDeskBefore {
  status: TaskDeskStatus;
  taskState: TaskHold | null;
  assigneeStaffId: number | null;
  assigneeStaffIds: number[];
  projectName: string | null;
}

export type PatchTaskDeskResult =
  | {
      ok: true;
      task: TaskDeskWireRow;
      before: TaskDeskBefore;
      /** The allowlist keys this call actually carried, in request order. */
      changed: ReadonlyArray<keyof TaskDeskPatch>;
    }
  | {
      ok: false;
      /** `schema_pending`: a hold write before `2026-09-30_work_assignment_task_state.sql` is applied. */
      reason: 'not_found' | 'illegal_transition' | 'invalid_assignee' | 'schema_pending';
      detail?: string;
    };

/** CANCELED is terminal and everything else is reversible. */
export function isTaskDeskTransitionAllowed(from: TaskDeskStatus, to: TaskDeskStatus): boolean {
  return from !== 'CANCELED' || to === 'CANCELED';
}

/** Column → SQL assignment. A later write wins, so one column is set once. */
function patchAssignments(
  patch: TaskDeskPatch,
  push: (value: unknown) => string,
): Map<string, string> {
  const set = new Map<string, string>();

  if (patch.status !== undefined) {
    set.set('status', `status = ${push(patch.status)}`);
    // DONE is the only status that carries a completion instant. COALESCE so a
    // repeat DONE does not re-date work that was finished yesterday.
    set.set(
      'completed_at',
      patch.status === 'DONE' ? 'completed_at = COALESCE(completed_at, now())' : 'completed_at = NULL',
    );
    if (patch.status === 'IN_PROGRESS') {
      set.set('started_at', 'started_at = COALESCE(started_at, now())');
    }
  }
  if (patch.taskState !== undefined) set.set('task_state', `task_state = ${push(patch.taskState)}`);
  if (patch.priority !== undefined) set.set('priority', `priority = ${push(patch.priority)}`);
  if (patch.deadlineAt !== undefined) {
    set.set('deadline_at', `deadline_at = ${push(patch.deadlineAt)}::timestamptz`);
  }
  // An explicit startedAt outranks the IN_PROGRESS stamp above.
  if (patch.startedAt !== undefined) {
    set.set('started_at', `started_at = ${push(patch.startedAt)}::timestamptz`);
  }
  if (patch.assigneeStaffId !== undefined) {
    set.set('assignee_staff_id', `assignee_staff_id = ${push(patch.assigneeStaffId)}`);
  }
  if (patch.projectName !== undefined) {
    set.set('project_name', `project_name = ${push(patch.projectName?.trim() || null)}`);
  }
  if (patch.note !== undefined) {
    // A blank note is no note: store NULL, never '' — the desk paints the two
    // identically and a search must not tell them apart either.
    set.set('notes', `notes = ${push(patch.note?.trim() || null)}`);
  }
  if (patch.remindAt !== undefined) {
    set.set('remind_at', `remind_at = ${push(patch.remindAt)}::timestamptz`);
  }
  if (patch.nextFollowUpAt !== undefined) {
    set.set('next_follow_up_at', `next_follow_up_at = ${push(patch.nextFollowUpAt)}::timestamptz`);
  }
  return set;
}

/** Tenant-scoped single-row patch, on a connection the caller already scoped (see `patchTaskDeskRow` in `list-tasks-db.ts`). */
export async function patchTaskDeskRowInTx(
  orgId: OrgId,
  taskId: number,
  requested: TaskDeskPatch,
  tx: TaskDeskTx,
): Promise<PatchTaskDeskResult> {
  const readerDeps: TaskDeskDeps = { query: (_orgId, sql, params) => tx.query(sql, params) };

  const current = await tx.query(
    `SELECT status::text AS status, assignee_staff_id, project_name,
            -- JSON null (column present, no hold) is NOT NULL; an absent key is.
            (to_jsonb(work_assignments) -> 'task_state') IS NOT NULL AS has_task_state,
            to_jsonb(work_assignments) ->> 'task_state' AS task_state
       FROM work_assignments
      WHERE organization_id = $1::uuid AND id = $2 AND work_type::text = $3
      FOR UPDATE`,
    [orgId, taskId, TASK_WORK_TYPE],
  );
  const currentRow = current.rows[0];
  const currentStatus = currentRow?.status;
  if (!isTaskDeskStatus(currentStatus)) {
    // No row, or a status outside the vocabulary — either way this id is not
    // a task this desk can drive.
    return { ok: false, reason: 'not_found' };
  }

  // A hold only exists on open work. Holding finished work ("Pending" on a Done
  // row) means "reopen it, held" — the one reading of that intent — so a bare
  // hold on DONE reopens in the same write instead of refusing. A client that
  // computed its patch from a status that just changed under it (Done, then a
  // quick slide to Pending) lands where the operator pointed, not on a 409.
  const patch: TaskDeskPatch =
    requested.taskState != null && requested.status === undefined && currentStatus === 'DONE'
      ? { ...requested, status: 'OPEN' }
      : requested;

  if (patch.status !== undefined && !isTaskDeskTransitionAllowed(currentStatus, patch.status)) {
    return { ok: false, reason: 'illegal_transition', detail: `${currentStatus} → ${patch.status}` };
  }
  if (patch.taskState !== undefined && currentRow.has_task_state !== true) {
    return { ok: false, reason: 'schema_pending', detail: '2026-09-30_work_assignment_task_state.sql' };
  }
  // Canceled is final: it can carry no hold (and cannot reopen).
  if (patch.taskState != null && !isTaskDeskOpen(patch.status ?? currentStatus)) {
    return { ok: false, reason: 'illegal_transition', detail: `${patch.status ?? currentStatus} cannot be ${patch.taskState}` };
  }

  const assigneeStaffIds = patch.assigneeStaffIds ??
    (patch.assigneeStaffId === undefined ? undefined : [patch.assigneeStaffId]);
  if (assigneeStaffIds !== undefined) {
    if (assigneeStaffIds.length < 1 || assigneeStaffIds.length > TASK_ASSIGNEES_MAX ||
        assigneeStaffIds.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > TASK_STAFF_ID_MAX) ||
        new Set(assigneeStaffIds).size !== assigneeStaffIds.length ||
        (patch.assigneeStaffId !== undefined && patch.assigneeStaffIds !== undefined &&
         patch.assigneeStaffId !== assigneeStaffIds[0])) {
      return { ok: false, reason: 'invalid_assignee' };
    }
    const staffRes = await tx.query(
      `SELECT id FROM staff WHERE organization_id = $1::uuid AND id = ANY($2::int[])`,
      [orgId, assigneeStaffIds],
    );
    if (staffRes.rowCount !== assigneeStaffIds.length) {
      return { ok: false, reason: 'invalid_assignee' };
    }
  }
  const previousMembers = await tx.query(
    `SELECT staff_id FROM work_assignment_assignees
      WHERE organization_id = $1::uuid AND assignment_id = $2
      ORDER BY CASE WHEN staff_id = $3 THEN 0 ELSE 1 END, staff_id`,
    [orgId, taskId, currentRow.assignee_staff_id],
  );

  const params: unknown[] = [orgId, taskId];
  const push = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const assignments = [...patchAssignments({
    ...patch, assigneeStaffId: assigneeStaffIds?.[0],
  }, push).values(), 'updated_at = now()'];

  const updated = await tx.query(
    `UPDATE work_assignments
        SET ${assignments.join(', ')}
      WHERE organization_id = $1::uuid AND id = $2
      RETURNING id`,
    params,
  );
  if (updated.rowCount === 0) return { ok: false, reason: 'not_found' };
  if (assigneeStaffIds !== undefined) {
    await tx.query(
      `DELETE FROM work_assignment_assignees
        WHERE organization_id = $1::uuid AND assignment_id = $2
          AND staff_id <> ALL($3::int[])`,
      [orgId, taskId, assigneeStaffIds],
    );
    await tx.query(
      `INSERT INTO work_assignment_assignees (organization_id, assignment_id, staff_id)
       SELECT $1::uuid, $2, unnest($3::int[])
       ON CONFLICT (organization_id, assignment_id, staff_id) DO NOTHING`,
      [orgId, taskId, assigneeStaffIds],
    );
  }

  const rows = await listTaskDeskRows(orgId, { lane: 'all', taskId, limit: 1 }, readerDeps);
  const task = rows[0];
  if (!task) {
    // The row updated but will not map — its entity_type is outside the task
    // vocabulary. That is schema drift, not a client error.
    throw new Error(`task ${taskId} updated but is not readable as a task desk row`);
  }
  return {
    ok: true,
    task,
    before: {
      status: currentStatus,
      taskState: parseTaskHold(currentRow.task_state),
      assigneeStaffId: toIntOrNull(currentRow?.assignee_staff_id),
      assigneeStaffIds: previousMembers.rows.map((member) => Number(member.staff_id)),
      projectName: toTextOrNull(currentRow.project_name),
    },
    changed: Object.keys(patch) as Array<keyof TaskDeskPatch>,
  };
}
