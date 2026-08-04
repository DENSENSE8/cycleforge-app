/**
 * Master plan → ops-plans projection (the **sole** agentic → plan-DB connection).
 *
 * Staff view plans through the ops-plans domain (ops_plans / ops_plan_phases /
 * ops_plan_tasks + /api/ops-plans + Operations ▸ Plans). This module
 * projects the agentic-loop master plan (CRDT MDX) into that domain so the
 * plan shows up in the same tables, inbox, and progress rollups as every
 * other plan — WITHOUT making Neon the CRDT store: the MDX stays the source
 * of truth and this projection is derived, idempotent, and re-runnable.
 *
 * Forge ingest (`cycle_forge_runs`), user-issues, and vendor integrations do
 * **not** write these tables — keep them adjacent.
 *
 * Mapping:
 *   plan   ← one ops_plan with the stable title below (station-agnostic)
 *   phase  ← each MDX `##` section that contains tickets (station ADMIN)
 *   task   ← each <TicketStatus/>; identity = client_event_id
 *            `master-plan:{ticketId}` (partial unique per org)
 *   status ← pending→open · in-progress→in_progress · deployed→done;
 *            tickets REMOVED from the MDX cancel their projected task.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { publishOpsPlanUpdated } from '@/lib/realtime/publish';
import { type TicketStatus } from './ticket-status';
import {
  MASTER_PLAN_OPS_TITLE,
  MASTER_PLAN_TASK_KEY_PREFIX,
} from './ops-plans-bridge-constants';
import { buildMasterPlanOutline } from './outline';

export { MASTER_PLAN_OPS_TITLE, MASTER_PLAN_TASK_KEY_PREFIX } from './ops-plans-bridge-constants';
export { buildMasterPlanOutline } from './outline';

const BRIDGE_STATION = 'ADMIN';

export type OpsTaskStatus = 'open' | 'in_progress' | 'done' | 'canceled';

export function ticketToTaskStatus(status: TicketStatus | null): OpsTaskStatus {
  switch (status) {
    case 'pending':
      return 'open';
    case 'in-progress':
      return 'in_progress';
    case 'deployed':
      return 'done';
    default:
      return 'open'; // invalid statuses surface as open + a note, never hidden
  }
}

export interface BridgeSyncResult {
  planId: string;
  createdPlan: boolean;
  upsertedTasks: number;
  canceledTasks: number;
}

export interface BridgeDeps {
  runTx: <T>(orgId: OrgId, fn: (client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  }) => Promise<T>) => Promise<T>;
  publish: (payload: { organizationId: string; planId: string; event: 'plan_updated'; source: string }) => Promise<void>;
}

export const defaultBridgeDeps: BridgeDeps = {
  runTx: (orgId, fn) => withTenantTransaction(orgId, fn),
  publish: (payload) => publishOpsPlanUpdated(payload),
};

/**
 * Idempotent projection sync. Safe to run on every plan read/mutation —
 * unchanged tickets update in place (no-op rows), removed tickets cancel.
 */
export async function syncMasterPlanToOpsPlans(
  orgId: OrgId,
  mdx: string,
  deps: BridgeDeps = defaultBridgeDeps,
): Promise<BridgeSyncResult> {
  const outline = buildMasterPlanOutline(mdx);

  const result = await deps.runTx(orgId, async (client) => {
    // 1. Find-or-create the projected plan by its stable title.
    const found = await client.query(
      `SELECT id FROM ops_plans
        WHERE organization_id = $1::uuid AND title = $2 AND archived_at IS NULL
        ORDER BY created_at ASC LIMIT 1`,
      [orgId, MASTER_PLAN_OPS_TITLE],
    );
    let planId = found.rows[0] ? String(found.rows[0].id) : null;
    const createdPlan = planId === null;
    if (!planId) {
      const inserted = await client.query(
        `INSERT INTO ops_plans (organization_id, title, description, status)
         VALUES ($1::uuid, $2, $3, 'draft'::ops_plan_status)
         RETURNING id`,
        [
          orgId,
          MASTER_PLAN_OPS_TITLE,
          'Auto-synced from master-plan.mdx (agentic loop). Edit the plan in Cursor or via the /forge plan agent — direct task edits here will be overwritten by the next sync.',
        ],
      );
      planId = String(inserted.rows[0].id);
    }

    // 2. Upsert one ADMIN phase per outline section.
    let upsertedTasks = 0;
    let sortOrder = 100;
    const seenKeys: string[] = [];
    for (const section of outline) {
      const phaseFound = await client.query(
        `SELECT id FROM ops_plan_phases
          WHERE organization_id = $1::uuid AND plan_id = $2::uuid AND title = $3
          LIMIT 1`,
        [orgId, planId, section.heading],
      );
      let phaseId = phaseFound.rows[0] ? String(phaseFound.rows[0].id) : null;
      if (!phaseId) {
        const phaseInserted = await client.query(
          `INSERT INTO ops_plan_phases (organization_id, plan_id, station, title, sort_order)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5)
           RETURNING id`,
          [orgId, planId, BRIDGE_STATION, section.heading, sortOrder],
        );
        phaseId = String(phaseInserted.rows[0].id);
      }
      sortOrder += 100;

      // 3. Upsert one task per ticket, keyed by client_event_id.
      let taskOrder = 100;
      for (const ticket of section.tickets) {
        const key = `${MASTER_PLAN_TASK_KEY_PREFIX}${ticket.ticketId}`;
        seenKeys.push(key);
        const status = ticketToTaskStatus(ticket.status);
        const noteBits = [
          ticket.href ? `Plan doc: ${ticket.href}` : null,
          ticket.resolutionCommit ? `Resolved in ${ticket.resolutionCommit}` : null,
          ticket.status === null ? `INVALID status "${ticket.rawStatus}" in master-plan.mdx` : null,
        ].filter(Boolean);
        await client.query(
          `INSERT INTO ops_plan_tasks
             (organization_id, phase_id, title, status, notes, sort_order, client_event_id,
              started_at, completed_at)
           VALUES ($1::uuid, $2::uuid, $3, $4::ops_plan_task_status, $5, $6, $7,
                   CASE WHEN $4 = 'in_progress' THEN now() ELSE NULL END,
                   CASE WHEN $4 = 'done' THEN now() ELSE NULL END)
           ON CONFLICT (organization_id, client_event_id) WHERE client_event_id IS NOT NULL
           DO UPDATE SET
             phase_id   = EXCLUDED.phase_id,
             title      = EXCLUDED.title,
             notes      = EXCLUDED.notes,
             sort_order = EXCLUDED.sort_order,
             status     = EXCLUDED.status,
             started_at = CASE WHEN EXCLUDED.status IN ('in_progress','done')
                               THEN COALESCE(ops_plan_tasks.started_at, now()) ELSE NULL END,
             completed_at = CASE WHEN EXCLUDED.status = 'done'
                                 THEN COALESCE(ops_plan_tasks.completed_at, now()) ELSE NULL END,
             updated_at = now()`,
          [orgId, phaseId, ticket.ticketId, status, noteBits.join(' · ') || null, taskOrder, key],
        );
        upsertedTasks += 1;
        taskOrder += 100;
      }
    }

    // 4. Cancel projected tasks whose ticket no longer exists in the MDX.
    const cancelRes = await client.query(
      `UPDATE ops_plan_tasks t
          SET status = 'canceled'::ops_plan_task_status, updated_at = now()
        FROM ops_plan_phases p
        WHERE t.phase_id = p.id
          AND p.plan_id = $2::uuid
          AND t.organization_id = $1::uuid
          AND p.organization_id = $1::uuid
          AND t.client_event_id LIKE $3
          AND t.status <> 'canceled'::ops_plan_task_status
          AND NOT (t.client_event_id = ANY($4::text[]))`,
      [orgId, planId, `${MASTER_PLAN_TASK_KEY_PREFIX}%`, seenKeys],
    );

    // 5. Reconcile phase + plan status (same shapes as the ops-plans domain).
    await client.query(
      `UPDATE ops_plan_phases p SET status = sub.next::ops_plan_phase_status, updated_at = now()
         FROM (
           SELECT p2.id,
                  CASE
                    WHEN COUNT(t.id) FILTER (WHERE t.status NOT IN ('done','canceled')) = 0
                         AND COUNT(t.id) > 0 THEN 'done'
                    WHEN COUNT(t.id) FILTER (WHERE t.status = 'in_progress') > 0 THEN 'in_progress'
                    ELSE 'open'
                  END AS next
             FROM ops_plan_phases p2
             LEFT JOIN ops_plan_tasks t
               ON t.phase_id = p2.id AND t.organization_id = p2.organization_id
            WHERE p2.plan_id = $2::uuid AND p2.organization_id = $1::uuid
            GROUP BY p2.id
         ) sub
        WHERE p.id = sub.id AND p.organization_id = $1::uuid`,
      [orgId, planId],
    );
    if (upsertedTasks > 0) {
      await client.query(
        `UPDATE ops_plans SET status = 'active'::ops_plan_status, updated_at = now()
          WHERE id = $2::uuid AND organization_id = $1::uuid
            AND status = 'draft'::ops_plan_status`,
        [orgId, planId],
      );
    }

    return { planId, createdPlan, upsertedTasks, canceledTasks: cancelRes.rowCount ?? 0 };
  });

  // Live nudge for any open plans UI — fire-and-forget semantics at call sites.
  await deps.publish({
    organizationId: orgId,
    planId: result.planId,
    event: 'plan_updated',
    source: 'master-plan-bridge',
  });

  return result;
}
