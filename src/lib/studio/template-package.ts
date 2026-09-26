/** CycleForgeTemplatePackage v1 — the portable, self-describing serialization of an ops-SOP template (Template Platform Phase 3). */

import { z } from 'zod';
import { StudioGraphNodeSchema, StudioGraphEdgeSchema } from '@/lib/schemas/studio';
import type { TemplateGraph } from './templates';

/** Bump only on a breaking package-shape change; validators pin the exact version. */
export const CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION = 1 as const;

/** Package graph — the same node/edge shape as the canvas + workflow_templates.graph. */
export const TemplatePackageGraphSchema = z.object({
  nodes: z.array(StudioGraphNodeSchema).max(200),
  edges: z.array(StudioGraphEdgeSchema).max(400),
});

/** Optional explicit surface binding carried by the package. */
export const TemplatePackageSurfaceSeedSchema = z.object({
  surfaceKey: z.string().min(1).max(64),
  pageKey: z.string().min(1).max(64),
  modeKey: z.string().min(1).max(64),
  /** Binds to a node id within THIS package's graph. */
  workflowNodeId: z.string().min(1).max(128),
  label: z.string().min(1).max(120),
});

export const TemplatePackageMetadataSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'slug is lowercase kebab-case'),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
});

export const TemplatePackageV1Schema = z.object({
  schemaVersion: z.literal(CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION),
  metadata: TemplatePackageMetadataSchema,
  engineCompat: z.object({
    requiredNodeTypes: z.array(z.string().min(1).max(64)).max(100),
  }),
  graph: TemplatePackageGraphSchema,
  surfaceSeeds: z.array(TemplatePackageSurfaceSeedSchema).max(50).optional(),
});
export type TemplatePackageV1 = z.infer<typeof TemplatePackageV1Schema>;

/** Injected registry predicates so validation is DB-/bootstrap-free in tests. */
export interface ValidatePackageDeps {
  /** Is this a registered engine node type? (workflow registry `hasNode`). */
  hasNode: (type: string) => boolean;
  /** Is this a registered operator surface key? (`isSurfaceKey`). */
  isSurfaceKey: (key: string) => boolean;
}

export type ValidatePackageResult =
  | { ok: true; package: TemplatePackageV1 }
  | { ok: false; errors: string[] };

function formatIssue(i: z.ZodIssue): string {
  const path = i.path.length ? i.path.join('.') : '(root)';
  return `${path}: ${i.message}`;
}

/** Full package validation: */
export function validateTemplatePackage(raw: unknown, deps: ValidatePackageDeps): ValidatePackageResult {
  const parsed = TemplatePackageV1Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(formatIssue) };
  }
  const pkg = parsed.data;
  const errors: string[] = [];

  const nodeTypes = new Set(pkg.graph.nodes.map((n) => n.type));
  const nodeIds = new Set(pkg.graph.nodes.map((n) => n.id));
  const required = new Set(pkg.engineCompat.requiredNodeTypes);

  for (const t of nodeTypes) {
    if (!deps.hasNode(t)) {
      errors.push(`graph uses unknown node type "${t}" — register it via a platform PR before importing`);
    } else if (!required.has(t)) {
      errors.push(`node type "${t}" is used in the graph but not declared in engineCompat.requiredNodeTypes`);
    }
  }
  for (const t of pkg.engineCompat.requiredNodeTypes) {
    if (!deps.hasNode(t)) {
      errors.push(`engineCompat.requiredNodeTypes lists unknown node type "${t}"`);
    }
  }
  for (const e of pkg.graph.edges) {
    if (!nodeIds.has(e.source)) errors.push(`edge "${e.id}" source "${e.source}" is not a node in the package graph`);
    if (!nodeIds.has(e.target)) errors.push(`edge "${e.id}" target "${e.target}" is not a node in the package graph`);
  }
  for (const s of pkg.surfaceSeeds ?? []) {
    if (!deps.isSurfaceKey(s.surfaceKey)) errors.push(`surfaceSeed names unknown surface "${s.surfaceKey}"`);
    if (!nodeIds.has(s.workflowNodeId)) errors.push(`surfaceSeed "${s.surfaceKey}" binds unknown node "${s.workflowNodeId}"`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, package: pkg };
}

/** Serialize a graph + metadata into a v1 package. */
export function buildTemplatePackage(input: {
  metadata: TemplatePackageV1['metadata'];
  graph: TemplateGraph;
}): TemplatePackageV1 {
  // The package graph node carries a non-optional `config` (the schema defaults
  // it to {}), so always emit it — even when empty — to match the shape.
  const nodes: TemplatePackageV1['graph']['nodes'] = input.graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    x: n.x,
    y: n.y,
    config: n.config ?? {},
  }));
  const edges: TemplatePackageV1['graph']['edges'] = input.graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourcePort: e.sourcePort,
    target: e.target,
  }));
  const requiredNodeTypes = [...new Set(nodes.map((n) => n.type))].sort();

  return {
    schemaVersion: CYCLEFORGE_TEMPLATE_PACKAGE_SCHEMA_VERSION,
    metadata: input.metadata,
    engineCompat: { requiredNodeTypes },
    graph: { nodes, edges },
  };
}
