/** Workflow node stats — the daily queue-depth + throughput snapshot job. */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle/db';
import type { OrgId } from '@/lib/tenancy/constants';

interface NodeStatsSnapshotResult {
  success: boolean;
  /** WIP rows written/updated for today (item_workflow_state snapshot). */
  rowsWritten: number;
  /** Throughput rows finalized for the prior day (workflow_runs → completed_count). */
  completedRowsWritten: number;
}

/** Snapshot per-(definition, node) queue depth + finalize prior-day throughput into workflow_node_stats. */
export async function runWorkflowNodeStatsSnapshot(orgId?: OrgId): Promise<NodeStatsSnapshotResult> {
  // ── 1. WIP snapshot for TODAY (unchanged) — completed_count defaults to 0 on
  //    insert and is left untouched on conflict; it is finalized by the NEXT
  //    day's run via the throughput statement below. ─────────────────────────
  const wipOrgFilter = orgId ? sql`AND s.organization_id = ${orgId}::uuid` : sql``;
  const wip = await db.execute(sql`
    INSERT INTO workflow_node_stats
      (organization_id, workflow_definition_id, node_id, snapshot_date,
       queue_depth, blocked_count, error_count, oldest_entered_at)
    SELECT s.organization_id,
           s.workflow_definition_id,
           s.current_node_id,
           CURRENT_DATE,
           COUNT(*) FILTER (WHERE s.status IN ('active', 'blocked'))::int,
           COUNT(*) FILTER (WHERE s.status = 'blocked')::int,
           COUNT(*) FILTER (WHERE s.status = 'error')::int,
           MIN(s.entered_node_at) FILTER (WHERE s.status IN ('active', 'blocked'))
      FROM item_workflow_state s
     WHERE s.status <> 'done'
       ${wipOrgFilter}
     GROUP BY s.organization_id, s.workflow_definition_id, s.current_node_id
    ON CONFLICT (workflow_definition_id, node_id, snapshot_date)
    DO UPDATE SET queue_depth       = EXCLUDED.queue_depth,
                  blocked_count     = EXCLUDED.blocked_count,
                  error_count       = EXCLUDED.error_count,
                  oldest_entered_at = EXCLUDED.oldest_entered_at
    RETURNING id
  `);

  // ── 2. THROUGHPUT finalize for the day that just ended (CURRENT_DATE - 1).
  const runOrgFilter = orgId ? sql`AND r.organization_id = ${orgId}::uuid` : sql``;
  const completed = await db.execute(sql`
    INSERT INTO workflow_node_stats
      (organization_id, workflow_definition_id, node_id, snapshot_date, completed_count)
    SELECT r.organization_id,
           r.workflow_definition_id,
           n.id,
           (CURRENT_DATE - 1),
           COUNT(*)::int
      FROM workflow_runs r
      JOIN workflow_nodes n
        ON n.workflow_definition_id = r.workflow_definition_id
       AND n.type = r.node_type
     WHERE r.workflow_definition_id IS NOT NULL
       AND r.created_at >= (CURRENT_DATE - 1)
       AND r.created_at <  CURRENT_DATE
       ${runOrgFilter}
     GROUP BY r.organization_id, r.workflow_definition_id, n.id
    ON CONFLICT (workflow_definition_id, node_id, snapshot_date)
    DO UPDATE SET completed_count = EXCLUDED.completed_count
    RETURNING id
  `);

  return {
    success: true,
    rowsWritten: wip.rows.length,
    completedRowsWritten: completed.rows.length,
  };
}
