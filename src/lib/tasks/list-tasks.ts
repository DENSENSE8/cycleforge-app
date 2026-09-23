/**
 * The **task desk** store — the read path for thrown `FOLLOW_UP` tasks, plus
 * the single-row patch that re-reads through it.
 *
 * Callers: GET /api/tasks, PATCH /api/tasks/[id], and (through those) the
 * desk, the `/m` face and the reports tab.
 *
 * ## Why the patch lives beside the reader
 * A PATCH must answer with the SAME row shape the list paints, or the desk
 * has two view models of one table and they drift the first time a join is
 * added. So the update re-reads through {@link listTaskDeskRows} on its own
 * transaction connection: one SELECT, one mapper, one shape.
 *
 * ## Tenancy
 * Every statement runs through the GUC wrappers in `@/lib/tenancy/db`, and
 * `orgId` comes from the route's auth context — never from a body or query
 * string. The deps seam exists so the unit tests run DB-free (house pattern,
 * see `src/lib/user-issues/issues.ts`).
 */

import {
  isTaskDeskStatus,
  taskDeskLaneStatuses,
  type TaskDeskLane,
  type TaskDeskPerson,
  type TaskDeskStatus,
  type TaskDeskTicket,
  type TaskDeskWireRow,
} from './task-desk-row';
import {
  TASK_PRIORITY,
  TASK_WORK_TYPE,
  taskEntityEnum,
  taskEntityFromEnum,
} from './task-vocabulary';
import type { OrgId } from '@/lib/tenancy/constants';

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

export interface ListTaskDeskOptions {
  /** Defaults to `open` — the working list IS the unfiltered default. */
  lane?: TaskDeskLane;
  /** Already resolved: `assignee=me` becomes `ctx.staffId` at the route. */
  assigneeStaffId?: number | null;
  /** Binary urgency rung, mapped onto the stored `priority` int. */
  urgency?: 'urgent' | 'normal' | null;
  limit?: number;
  /** Narrow to one row — how the patch re-reads its own result. */
  taskId?: number | null;
}

interface TaskDeskSqlRow {
  id: unknown;
  entity_type: unknown;
  entity_id: unknown;
  notes: unknown;
  status: unknown;
  priority: unknown;
  assignee_staff_id: unknown;
  assignee_name: unknown;
  assigned_by_staff_id: unknown;
  assigned_by_name: unknown;
  assigned_at: unknown;
  started_at: unknown;
  deadline_at: unknown;
  completed_at: unknown;
  ticket_id: unknown;
  ticket_provider: unknown;
  ticket_subject: unknown;
  ticket_status: unknown;
  ticket_external_id: unknown;
}

/**
 * ONE statement. The two `staff` joins are the assignee and the thrower; the
 * `support_tickets` join is the paired ticket's local caches, and it is
 * org-led on both sides so a foreign ticket can never paint a row.
 */
const TASK_DESK_SQL = `
  SELECT wa.id,
         wa.entity_type::text        AS entity_type,
         wa.entity_id,
         wa.notes,
         wa.status::text             AS status,
         wa.priority,
         wa.assignee_staff_id,
         sa.name                     AS assignee_name,
         wa.assigned_by_staff_id,
         sb.name                     AS assigned_by_name,
         wa.assigned_at,
         wa.started_at,
         wa.deadline_at,
         wa.completed_at,
         st.id                       AS ticket_id,
         st.provider                 AS ticket_provider,
         st.subject_cache            AS ticket_subject,
         st.status_cache             AS ticket_status,
         st.external_ticket_id       AS ticket_external_id
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
   WHERE wa.organization_id = $1::uuid
     AND wa.work_type::text = $3
     AND ($4::text[] IS NULL OR wa.status::text = ANY($4::text[]))
     AND ($5::int IS NULL OR wa.assignee_staff_id = $5)
     AND ($6::int IS NULL OR wa.priority <= $6)
     AND ($7::int IS NULL OR wa.priority > $7)
     AND ($8::bigint IS NULL OR wa.id = $8)
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
 * A staffer with no readable `staff` row (deleted mid-org-move, or a row that
 * outlived its tenant) still has an id, and the desk must not silently drop
 * the "who". The placeholder is deliberately machine-looking so it reads as
 * the anomaly it is rather than as a person's name.
 */
function person(id: unknown, name: unknown): TaskDeskPerson | null {
  const staffId = toIntOrNull(id);
  if (staffId == null) return null;
  const label = toTextOrNull(name)?.trim();
  return { id: staffId, name: label || `Staff #${staffId}` };
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

/**
 * `null` when the stored `work_entity_type_enum` label is not in the task
 * vocabulary. Such a row is dropped rather than emitted with a guessed
 * `entityType`: the desk's "open the record" href is derived from it, and a
 * wrong href is worse than an absent row.
 */
function mapRow(raw: Record<string, unknown>): TaskDeskWireRow | null {
  const row = raw as unknown as TaskDeskSqlRow;
  const entityType = taskEntityFromEnum(row.entity_type);
  if (!entityType) return null;

  const id = toIntOrNull(row.id);
  const entityId = toIntOrNull(row.entity_id);
  if (id == null || entityId == null) return null;

  return {
    id,
    entityType,
    entityId,
    note: toTextOrNull(row.notes),
    status: String(row.status ?? ''),
    priority: toIntOrNull(row.priority),
    assignee: person(row.assignee_staff_id, row.assignee_name),
    assignedBy: person(row.assigned_by_staff_id, row.assigned_by_name),
    assignedAt: toIso(row.assigned_at) ?? new Date(0).toISOString(),
    startedAt: toIso(row.started_at),
    deadlineAt: toIso(row.deadline_at),
    completedAt: toIso(row.completed_at),
    ticket: ticket(row),
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

export async function listTaskDeskRows(
  orgId: OrgId,
  opts: ListTaskDeskOptions,
  deps: TaskDeskDeps,
): Promise<TaskDeskWireRow[]> {
  const lane: TaskDeskLane = opts.lane ?? 'open';
  const laneStatuses = taskDeskLaneStatuses(lane);
  const assigneeStaffId =
    typeof opts.assigneeStaffId === 'number' && opts.assigneeStaffId > 0
      ? Math.floor(opts.assigneeStaffId)
      : null;
  const taskId =
    typeof opts.taskId === 'number' && opts.taskId > 0 ? Math.floor(opts.taskId) : null;
  const { atMost, above } = priorityBounds(opts.urgency ?? null);

  const result = await deps.query(orgId, TASK_DESK_SQL, [
    orgId,
    taskEntityEnum('support_ticket'),
    TASK_WORK_TYPE,
    laneStatuses ? [...laneStatuses] : null,
    assigneeStaffId,
    atMost,
    above,
    taskId,
    clampTaskDeskLimit(opts.limit),
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
  priority?: number;
  deadlineAt?: string | null;
  startedAt?: string | null;
  assigneeStaffId?: number;
}

/** What the row looked like before the patch — the audit row's `before`. */
export interface TaskDeskBefore {
  status: TaskDeskStatus;
  assigneeStaffId: number | null;
}

export type PatchTaskDeskResult =
  | {
      ok: true;
      task: TaskDeskWireRow;
      before: TaskDeskBefore;
      /** The allowlist keys this call actually carried, in request order. */
      changed: ReadonlyArray<keyof TaskDeskPatch>;
    }
  | { ok: false; reason: 'not_found' | 'illegal_transition' | 'invalid_assignee'; detail?: string };

/**
 * CANCELED is terminal and everything else is reversible.
 *
 * A withdrawn task is not re-driven — the operator throws a new one, so the
 * record of what was abandoned stays honest. Every other status can be walked
 * back (including DONE → IN_PROGRESS, the "that wasn't finished" case), which
 * is why this is one rule rather than a 5×5 table nobody can keep true.
 */
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
  return set;
}

/**
 * Tenant-scoped single-row patch, on a connection the caller already scoped
 * (see `patchTaskDeskRow` in `list-tasks-db.ts`). Reads the current status
 * under `FOR UPDATE` so a concurrent cancel cannot be overwritten, then
 * re-reads the joined row through {@link listTaskDeskRows} on that same
 * connection — one SELECT, one mapper, one row shape.
 */
export async function patchTaskDeskRowInTx(
  orgId: OrgId,
  taskId: number,
  patch: TaskDeskPatch,
  tx: TaskDeskTx,
): Promise<PatchTaskDeskResult> {
  const readerDeps: TaskDeskDeps = { query: (_orgId, sql, params) => tx.query(sql, params) };

  const current = await tx.query(
    `SELECT status::text AS status, assignee_staff_id
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

  if (patch.status !== undefined && !isTaskDeskTransitionAllowed(currentStatus, patch.status)) {
    return { ok: false, reason: 'illegal_transition', detail: `${currentStatus} → ${patch.status}` };
  }

  if (patch.assigneeStaffId !== undefined) {
    const staffRes = await tx.query(
      `SELECT 1 FROM staff WHERE id = $1 AND organization_id = $2::uuid LIMIT 1`,
      [patch.assigneeStaffId, orgId],
    );
    if (staffRes.rowCount === 0) {
      return { ok: false, reason: 'invalid_assignee', detail: String(patch.assigneeStaffId) };
    }
  }

  const params: unknown[] = [orgId, taskId];
  const push = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const assignments = [...patchAssignments(patch, push).values(), 'updated_at = now()'];

  const updated = await tx.query(
    `UPDATE work_assignments
        SET ${assignments.join(', ')}
      WHERE organization_id = $1::uuid AND id = $2
      RETURNING id`,
    params,
  );
  if (updated.rowCount === 0) return { ok: false, reason: 'not_found' };

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
      assigneeStaffId: toIntOrNull(currentRow?.assignee_staff_id),
    },
    changed: Object.keys(patch) as Array<keyof TaskDeskPatch>,
  };
}
