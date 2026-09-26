import { NextResponse } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantDrizzle } from '@/lib/drizzle/tenant-db';
import { itemWorkflowState, workflowDefinitions } from '@/lib/drizzle/schema';

/** GET /api/studio/live?v=<definitionId> */
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (request, ctx) => {
    const vRaw = request.nextUrl.searchParams.get('v');
    const v = vRaw ? Number(vRaw) : null;
    if (vRaw && (!Number.isFinite(v) || (v ?? 0) <= 0)) {
      return NextResponse.json({ ok: false, error: 'invalid v' }, { status: 400 });
    }

    // GUC-scoped (RLS-ready):
    const result = await withTenantDrizzle(ctx.organizationId, async (tx) => {
      // Resolve the definition org-scoped (default: the active one).
      const [definition] = await tx
        .select({ id: workflowDefinitions.id })
        .from(workflowDefinitions)
        .where(
          and(
            eq(workflowDefinitions.organizationId, ctx.organizationId),
            v ? eq(workflowDefinitions.id, v) : eq(workflowDefinitions.isActive, true),
          ),
        )
        .limit(1);

      if (!definition) {
        return { ok: true as const, nodes: {}, totalInFlight: 0 };
      }

      const rows = await tx
        .select({
          nodeId: itemWorkflowState.currentNodeId,
          active: sql<number>`count(*) filter (where ${itemWorkflowState.status} = 'active')::int`,
          blocked: sql<number>`count(*) filter (where ${itemWorkflowState.status} = 'blocked')::int`,
          error: sql<number>`count(*) filter (where ${itemWorkflowState.status} = 'error')::int`,
          oldestEnteredAt: sql<string | null>`min(${itemWorkflowState.enteredNodeAt}) filter (where ${itemWorkflowState.status} in ('active', 'blocked'))`,
        })
        .from(itemWorkflowState)
        .where(
          and(
            eq(itemWorkflowState.organizationId, ctx.organizationId),
            eq(itemWorkflowState.workflowDefinitionId, definition.id),
            ne(itemWorkflowState.status, 'done'),
          ),
        )
        .groupBy(itemWorkflowState.currentNodeId);

      const nodes: Record<
        string,
        { active: number; blocked: number; error: number; total: number; oldestEnteredAt: string | null }
      > = {};
      let totalInFlight = 0;
      for (const r of rows) {
        const total = r.active + r.blocked;
        nodes[r.nodeId] = {
          active: r.active,
          blocked: r.blocked,
          error: r.error,
          total,
          oldestEnteredAt: r.oldestEnteredAt,
        };
        totalInFlight += total;
      }

      return { ok: true as const, nodes, totalInFlight };
    });

    return NextResponse.json(result);
  },
  { permission: 'studio.view', feature: 'studio' },
);
