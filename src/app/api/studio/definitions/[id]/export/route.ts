import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';
import { db } from '@/lib/drizzle/db';
import { workflowDefinitions, workflowNodes, workflowEdges } from '@/lib/drizzle/schema';
import { buildTemplatePackage } from '@/lib/studio/template-package';
import type { TemplateGraph } from '@/lib/studio/templates';

/** GET /api/studio/definitions/[id]/export */
export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'workflow'
  );
}

export const GET = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../api/studio/definitions/[id]/export → id is segments[-2]
  const id = Number(segments[segments.length - 2]);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid definition id' }, { status: 400 });
  }

  try {
    const [def] = await db
      .select({ id: workflowDefinitions.id, name: workflowDefinitions.name })
      .from(workflowDefinitions)
      .where(and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.organizationId, ctx.organizationId)))
      .limit(1);
    if (!def) {
      return NextResponse.json({ ok: false, error: 'definition not found' }, { status: 404 });
    }

    const [nodeRows, edgeRows] = await Promise.all([
      db.select().from(workflowNodes).where(eq(workflowNodes.workflowDefinitionId, def.id)),
      db.select().from(workflowEdges).where(eq(workflowEdges.workflowDefinitionId, def.id)),
    ]);

    const graph: TemplateGraph = {
      nodes: nodeRows.map((n) => ({
        id: n.id,
        type: n.type,
        x: Number(n.positionX),
        y: Number(n.positionY),
        config: (n.config ?? {}) as Record<string, unknown>,
      })),
      edges: edgeRows.map((e) => ({
        id: e.id,
        source: e.sourceNode,
        sourcePort: e.sourcePort,
        target: e.targetNode,
      })),
    };

    const pkg = buildTemplatePackage({
      metadata: { slug: slugify(def.name), name: def.name, description: null, category: null },
      graph,
    });

    return NextResponse.json({ ok: true, package: pkg });
  } catch (err) {
    console.error('[GET /api/studio/definitions/[id]/export] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'export failed' },
      { status: 500 },
    );
  }
}, { permission: 'studio.view', feature: 'studio' });
