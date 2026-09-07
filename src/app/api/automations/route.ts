import { NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantDrizzle } from '@/lib/drizzle/tenant-db';
import {
  itemWorkflowState,
  workflowDefinitions,
  workflowNodes,
  workflowRuns,
} from '@/lib/drizzle/schema';
import type { AutomationDefinitionSummary } from '@/lib/automations/types';

/**
 * GET /api/automations
 *
 * The org's INSTALLED automations feed for the /automations marketplace's
 * "Your automations" section. One row per workflow definition the org owns,
 * rolled up with its step (node) count, current in-flight occupancy
 * (item_workflow_state rows in status='active'), and the timestamp of its
 * most recent run.
 *
 * Observe-only (Phase 1): this is a pure read — no run/trigger mutation.
 * studio.view to browse; installing a blueprint is studio.manage via the
 * import routes.
 */
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (_req, ctx) => {
    try {
      // GUC-wrapped (withTenantDrizzle sets app.current_org) so the FORCEd
      // workflow tables' RLS policies are live on the tenant pool; the
      // explicit organizationId predicates stay as the primary filter.
      const installed = await withTenantDrizzle(ctx.organizationId, async (tx) => {
        const defs = await tx
          .select({
            id: workflowDefinitions.id,
            name: workflowDefinitions.name,
            version: workflowDefinitions.version,
            isActive: workflowDefinitions.isActive,
            updatedAt: workflowDefinitions.updatedAt,
          })
          .from(workflowDefinitions)
          .where(eq(workflowDefinitions.organizationId, ctx.organizationId))
          .orderBy(asc(workflowDefinitions.name), desc(workflowDefinitions.version));

        if (defs.length === 0) {
          return [];
        }

        const ids = defs.map((d) => d.id);

        const [nodeCounts, inFlight, lastRuns] = await Promise.all([
          tx
            .select({
              defId: workflowNodes.workflowDefinitionId,
              n: sql<number>`count(*)::int`,
            })
            .from(workflowNodes)
            .where(inArray(workflowNodes.workflowDefinitionId, ids))
            .groupBy(workflowNodes.workflowDefinitionId),
          tx
            .select({
              defId: itemWorkflowState.workflowDefinitionId,
              n: sql<number>`count(*)::int`,
            })
            .from(itemWorkflowState)
            .where(
              and(
                eq(itemWorkflowState.organizationId, ctx.organizationId),
                eq(itemWorkflowState.status, 'active'),
                inArray(itemWorkflowState.workflowDefinitionId, ids),
              ),
            )
            .groupBy(itemWorkflowState.workflowDefinitionId),
          tx
            .select({
              defId: workflowRuns.workflowDefinitionId,
              last: sql<string | null>`max(created_at)`,
            })
            .from(workflowRuns)
            .where(
              and(
                eq(workflowRuns.organizationId, ctx.organizationId),
                inArray(workflowRuns.workflowDefinitionId, ids),
              ),
            )
            .groupBy(workflowRuns.workflowDefinitionId),
        ]);

        const nodeCountByDef = new Map<number, number>(
          nodeCounts.map((r) => [r.defId, Number(r.n) || 0]),
        );
        const inFlightByDef = new Map<number, number>(
          inFlight.map((r) => [r.defId, Number(r.n) || 0]),
        );
        const lastRunByDef = new Map<number, string | null>(
          lastRuns
            .filter((r): r is { defId: number; last: string | null } => r.defId != null)
            .map((r) => [r.defId, r.last]),
        );

        return defs.map((def): AutomationDefinitionSummary => {
          const last = lastRunByDef.get(def.id) ?? null;
          return {
            id: def.id,
            name: def.name,
            version: def.version,
            isActive: def.isActive,
            nodeCount: nodeCountByDef.get(def.id) ?? 0,
            inFlight: inFlightByDef.get(def.id) ?? 0,
            lastRunAt: last ? new Date(last).toISOString() : null,
            updatedAt: def.updatedAt.toISOString?.() ?? String(def.updatedAt),
          };
        });
      });

      return NextResponse.json({ ok: true, installed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'automations feed failed';
      console.error('[GET /api/automations] error:', err);
      return NextResponse.json({ ok: false, installed: [], error: message }, { status: 500 });
    }
  },
  { permission: 'studio.view', feature: 'studio' },
);
