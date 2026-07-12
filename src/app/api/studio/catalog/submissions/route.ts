import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';
import { db } from '@/lib/drizzle/db';
import { workflowTemplates } from '@/lib/drizzle/schema';
import type { TemplateGraph } from '@/lib/studio/templates';

/**
 * GET /api/studio/catalog/submissions
 *
 * The curator review queue (Template Platform Phase 4): non-system templates an
 * org has submitted for the public catalog (review_status='submitted'), newest
 * submission first. A curator (studio.catalog.review) works this queue and
 * approve/rejects each via the [id]/review route.
 *
 * studio.catalog.review — this is a platform-curator surface (it sees every org's
 * submissions), NOT a per-tenant one, so it is gated by the curation permission,
 * not studio.view/manage.
 */
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async () => {
    try {
      const rows = await db
        .select({
          id: workflowTemplates.id,
          slug: workflowTemplates.slug,
          name: workflowTemplates.name,
          description: workflowTemplates.description,
          category: workflowTemplates.category,
          graph: workflowTemplates.graph,
          submittedByOrg: workflowTemplates.submittedByOrg,
          submittedAt: workflowTemplates.submittedAt,
        })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isSystem, false),
            eq(workflowTemplates.reviewStatus, 'submitted'),
          ),
        )
        .orderBy(desc(workflowTemplates.submittedAt));

      const submissions = rows.map((r) => {
        const graph = (r.graph ?? { nodes: [], edges: [] }) as TemplateGraph;
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          category: r.category,
          nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
          edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
          submittedByOrg: r.submittedByOrg,
          submittedAt: r.submittedAt,
        };
      });

      return NextResponse.json({ ok: true, submissions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'studio submissions failed';
      console.error('[GET /api/studio/catalog/submissions] error:', err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  },
  { permission: 'studio.catalog.review', feature: 'studio' },
);
