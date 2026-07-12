/**
 * Shared identity for the agentic-loop → ops_plans projection.
 *
 * This is the **sole** intentional connection from the master-plan CRDT into
 * the Neon plan tables (`ops_plans` / phases / tasks). Forge ingest,
 * user-issues, and vendor integrations stay adjacent — they do not write
 * ops_plan_tasks. See `ops-plans-bridge.ts` for the sync implementation.
 */

/** Stable ops_plans.title used by find-or-create (do not rename in Ops UI). */
export const MASTER_PLAN_OPS_TITLE = 'Agentic Loop — Master Plan';

/** Prefix for ops_plan_tasks.client_event_id → `master-plan:{ticketId}`. */
export const MASTER_PLAN_TASK_KEY_PREFIX = 'master-plan:';

/**
 * Prefix for **org adoption** tasks seeded from `connections_gap_adoption`
 * (and optional deploy upserts). Must never equal `master-plan:` so product
 * CONN tickets and customer checklists cannot collide.
 *
 * @see docs/todo/connections-mdx-forge-plan.md §5.2
 */
export const CONN_ADOPT_TASK_KEY_PREFIX = 'conn-adopt:';

/** Stable title for the org-scoped adoption plan (from-template). */
export const CONNECTIONS_ADOPTION_OPS_TITLE = 'Connections gap adoption';
