/** submit-template — an org offers one of its OWN workflow definitions to the curated public catalog (Template Platform Phase 4). */

import pool from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/drizzle/db';
import { workflowDefinitions, workflowNodes, workflowEdges } from '@/lib/drizzle/schema';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TemplateGraph } from './templates';
import { buildTemplatePackage, type TemplatePackageV1 } from './template-package';

export interface SubmitTemplateArgs {
  orgId: OrgId;
  /** The org's own workflow_definitions.id to serialize + submit. */
  definitionId: number;
  /** Optional catalog metadata overrides; fall back to the definition's name. */
  metadata?: { name?: string; description?: string | null; category?: string | null };
}

export interface SubmitTemplateResult {
  status: 200 | 404 | 500;
  submitted: boolean;
  templateId: number | null;
  /** Final (possibly suffixed) globally-unique slug of the submitted row. */
  templateSlug: string | null;
  /** The package that was persisted (nodes/edges counts, requiredNodeTypes). */
  package: TemplatePackageV1 | null;
  reason?: string;
}

export interface SubmitTemplateDeps {
  /** Load the org's own definition graph, org-scoped; null if not found / not theirs. */
  loadDefinitionGraph: (
    orgId: OrgId,
    definitionId: number,
  ) => Promise<{ name: string; graph: TemplateGraph } | null>;
  /** Persist the package as a NON-system, 'submitted' template row; returns id + final slug. */
  persistSubmission: (
    pkg: TemplatePackageV1,
    ctx: { orgId: OrgId },
  ) => Promise<{ templateId: number; slug: string }>;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'workflow'
  );
}

/** Real definition read — org-scoped over the caller's own graph (Drizzle). */
async function loadDefinitionGraphReal(
  orgId: OrgId,
  definitionId: number,
): Promise<{ name: string; graph: TemplateGraph } | null> {
  const [def] = await db
    .select({ id: workflowDefinitions.id, name: workflowDefinitions.name })
    .from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.id, definitionId), eq(workflowDefinitions.organizationId, orgId)))
    .limit(1);
  if (!def) return null;

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
  return { name: def.name, graph };
}

/**
 * Real persistence: INSERT the package as a NON-system, 'submitted' row.
 * `slug` is globally UNIQUE (ux_workflow_templates_slug), so retry with a numeric
 * suffix on conflict (mirrors import-package's persistPackageAsTemplate).
 */
async function persistSubmissionReal(
  pkg: TemplatePackageV1,
  ctx: { orgId: OrgId },
): Promise<{ templateId: number; slug: string }> {
  const base = pkg.metadata.slug;
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const res = await pool.query<{ id: number }>(
      `INSERT INTO workflow_templates
         (slug, name, description, category, graph, is_system, is_default,
          visibility, review_status, submitted_by_org, submitted_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, FALSE, FALSE,
          'private', 'submitted', $6, now())
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [
        candidate,
        pkg.metadata.name,
        pkg.metadata.description ?? null,
        pkg.metadata.category ?? null,
        JSON.stringify(pkg.graph),
        ctx.orgId,
      ],
    );
    if (res.rows[0]) return { templateId: Number(res.rows[0].id), slug: candidate };
  }
  throw new Error('could not allocate a unique template slug');
}

const defaultDeps: SubmitTemplateDeps = {
  loadDefinitionGraph: loadDefinitionGraphReal,
  persistSubmission: persistSubmissionReal,
};

export async function submitTemplateFromDefinition(
  args: SubmitTemplateArgs,
  deps: SubmitTemplateDeps = defaultDeps,
): Promise<SubmitTemplateResult> {
  const loaded = await deps.loadDefinitionGraph(args.orgId, args.definitionId);
  if (!loaded) {
    return {
      status: 404,
      submitted: false,
      templateId: null,
      templateSlug: null,
      package: null,
      reason: 'definition not found',
    };
  }

  const name = args.metadata?.name?.trim() || loaded.name;
  const pkg = buildTemplatePackage({
    metadata: {
      slug: slugify(name),
      name,
      description: args.metadata?.description ?? null,
      category: args.metadata?.category ?? null,
    },
    graph: loaded.graph,
  });

  const { templateId, slug } = await deps.persistSubmission(pkg, { orgId: args.orgId });

  return {
    status: 200,
    submitted: true,
    templateId,
    templateSlug: slug,
    package: pkg,
  };
}
