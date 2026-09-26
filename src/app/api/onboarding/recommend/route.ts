import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';
import { db } from '@/lib/drizzle/db';
import { workflowTemplates } from '@/lib/drizzle/schema';
import { parseBody } from '@/lib/schemas/parse';
import { OnboardingRecommendBody } from '@/lib/schemas/studio';
import type { TemplateGraph } from '@/lib/studio/templates';
import { recommendTemplates, type TemplateCandidate } from '@/lib/studio/recommend-template';

/** POST /api/onboarding/recommend */
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async (request) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
    }
    const parsed = parseBody(OnboardingRecommendBody, raw ?? {});
    if (parsed instanceof NextResponse) return parsed;

    const rows = await db
      .select({
        slug: workflowTemplates.slug,
        name: workflowTemplates.name,
        description: workflowTemplates.description,
        category: workflowTemplates.category,
        graph: workflowTemplates.graph,
      })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.isSystem, true))
      .orderBy(asc(workflowTemplates.name));

    const candidates: TemplateCandidate[] = rows.map((r) => {
      const graph = (r.graph ?? { nodes: [], edges: [] }) as TemplateGraph;
      const nodeTypes = Array.isArray(graph.nodes)
        ? [...new Set(graph.nodes.map((n) => n.type))]
        : [];
      return {
        slug: r.slug,
        name: r.name,
        description: r.description,
        category: r.category,
        nodeTypes,
      };
    });

    const result = await recommendTemplates(
      { text: parsed.text, category: parsed.category ?? null },
      candidates,
    );

    return NextResponse.json({ ok: true, recommendations: result.recommendations });
  },
  { permission: 'studio.view', feature: 'studio' },
);
