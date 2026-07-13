-- ============================================================================
-- 2026-07-12b_ops_plan_tasks_phase_index.sql
--
-- Add the missing supporting index for the ops_plan_tasks → ops_plan_phases FK
-- join. `ops_plan_progress()` (2026-07-08d) and reconcilePhase() both join
-- `ops_plan_tasks t ON p.id = t.phase_id` filtered on the phases side only —
-- with no index on the tasks side that is a full-table scan of ops_plan_tasks
-- on every plan-progress read (HOME-OPS TV board amplifies this: one call per
-- active plan per refresh) AND on every task write (reconcilePhase). The
-- ops_plan_tasks index set from 2026-07-08c covers assignee / unassigned / due /
-- client-event, but none serves a phase_id lookup.
--
-- Org-led (house convention) + additive + idempotent — no data change.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ops_plan_tasks_phase
  ON ops_plan_tasks (organization_id, phase_id);
