/**
 * Arbiter for partial unique index `ux_work_assignments_active_entity`
 * (migration `2026-08-08b_work_assignment_task_columns.sql`).
 *
 * Every `ON CONFLICT` against that index MUST use this fragment — column list +
 * WHERE must match the index definition exactly or Postgres raises 42P10
 * ("there is no unique or exclusion constraint matching the ON CONFLICT
 * specification"). That is what surfaced to packers as "Failed to update
 * order" from `/api/packing-logs`. Prefer this over bare `ON CONFLICT DO
 * NOTHING` on work_assignments inserts so the arbiter stays explicit.
 *
 * Index definition:
 *   UNIQUE (organization_id, entity_type, entity_id, work_type)
 *   WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
 *     AND work_type <> 'FOLLOW_UP'
 *
 * The inserted row's `status` must be one of OPEN / ASSIGNED / IN_PROGRESS for
 * the partial index to apply to a fresh insert; DO UPDATE may then set DONE.
 */
export const WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT = `(organization_id, entity_type, entity_id, work_type)
    WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
      AND work_type <> 'FOLLOW_UP'`;
