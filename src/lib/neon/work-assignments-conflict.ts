/** Arbiter for partial unique index `ux_work_assignments_active_entity` (migration `2026-08-08b_work_assignment_task_columns.sql`). */
export const WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT = `(organization_id, entity_type, entity_id, work_type)
    WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
      AND work_type <> 'FOLLOW_UP'`;
