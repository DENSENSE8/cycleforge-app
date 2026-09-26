import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';
import { db } from '@/lib/drizzle/db';
import { workflowTemplates } from '@/lib/drizzle/schema';
import type { TemplateGraph } from '@/lib/studio/templates';
import type { StudioTemplateSummary } from '@/components/studio/studio-types';

/** GET /api/studio/catalog */
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
          isDefault: workflowTemplates.isDefault,
          graph: workflowTemplates.graph,
        })
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.isSystem, false),
            eq(workflowTemplates.reviewStatus, 'approved'),
            eq(workflowTemplates.visibility, 'public'),
          ),
        )
        .orderBy(asc(workflowTemplates.name));

      const templates: StudioTemplateSummary[] = rows.map((r) => {
        const graph = (r.graph ?? { nodes: [], edges: [] }) as TemplateGraph;
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          category: r.category,
          nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
          edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
          isDefault: Boolean(r.isDefault),
        };
      });

      return NextResponse.json({ ok: true, templates });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'studio catalog failed';
      console.error('[GET /api/studio/catalog] error:', err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  },
  { permission: 'studio.view', feature: 'studio' },
);
