/** Shared identity for the agentic-loop → ops_plans projection. */

/** Stable ops_plans.title used by find-or-create (do not rename in Ops UI). */
export const MASTER_PLAN_OPS_TITLE = 'Agentic Loop — Master Plan';

/** Prefix for ops_plan_tasks.client_event_id → `master-plan:{ticketId}`. */
export const MASTER_PLAN_TASK_KEY_PREFIX = 'master-plan:';

/** Prefix for **org adoption** tasks seeded from `connections_gap_adoption` (and optional deploy upserts). */
export const CONN_ADOPT_TASK_KEY_PREFIX = 'conn-adopt:';

/** Stable title for the org-scoped adoption plan (from-template). */
export const CONNECTIONS_ADOPTION_OPS_TITLE = 'Connections gap adoption';
