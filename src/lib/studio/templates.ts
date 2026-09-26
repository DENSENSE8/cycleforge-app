/** studio/templates — clone a system-owned workflow_templates blueprint into the calling org's workflow_definitions as a new is_active =… */

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';

type TxClient = Pick<PoolClient, 'query'>;

/** The graph shape persisted on workflow_templates.graph (matches the canvas). */
export interface TemplateGraphNode {
  id: string;
  type: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
}
export interface TemplateGraphEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
}
export interface TemplateGraph {
  nodes: TemplateGraphNode[];
  edges: TemplateGraphEdge[];
}

export interface CreateDraftFromTemplateArgs {
  client: TxClient;
  orgId: OrgId;
  /** workflow_definitions.created_by for the new draft. */
  staffId: number;
  /** The workflow_templates row to clone. */
  templateId: number;
  /**
   * Optional explicit name for the new definition; defaults to the template's
   * name. Imports collide-safe by version: a second import of the same template
   * lands as v2 of the same name (NOT an error) — the owner edits/renames it.
   */
  name?: string;
}

export type CreateDraftFromTemplateResult =
  | { status: 404; body: { ok: false; error: string } }
  | {
      status: 200;
      body: { ok: true; id: number; version: number };
      audit: {
        draftId: number;
        templateId: number;
        templateSlug: string;
        name: string;
        version: number;
        nodes: number;
        edges: number;
      };
    };

/** Injectable collaborators (real impls by default; fakes in tests). */
export interface CreateDraftFromTemplateDeps {
  /** Mint a fresh global node/edge id. Defaulted to crypto so tests can make it deterministic. */
  newId: (prefix: 'n' | 'e') => string;
}

const defaultDeps: CreateDraftFromTemplateDeps = {
  newId: (prefix) => `${prefix}-${randomUUID()}`,
};

/** Coerce a stored graph value to the { nodes, edges } shape (tolerant of nulls). */
function normalizeGraph(raw: unknown): TemplateGraph {
  const g = (raw ?? {}) as Partial<TemplateGraph>;
  return {
    nodes: Array.isArray(g.nodes) ? g.nodes : [],
    edges: Array.isArray(g.edges) ? g.edges : [],
  };
}

/** Clones a system template into the org's NEXT version of `name` (default: */
export async function createDraftFromTemplate(
  args: CreateDraftFromTemplateArgs,
  deps: CreateDraftFromTemplateDeps = defaultDeps,
): Promise<CreateDraftFromTemplateResult> {
  const { client, orgId, staffId, templateId } = args;

  // Resolve the system template (global table — no org predicate by design).
  const tpl = await client.query<{ slug: string; name: string; graph: unknown }>(
    `SELECT slug, name, graph FROM workflow_templates WHERE id = $1`,
    [templateId],
  );
  if (!tpl.rows[0]) {
    return { status: 404 as const, body: { ok: false, error: 'template not found' } };
  }
  const template = tpl.rows[0];
  const name = (args.name ?? template.name).trim() || template.name;
  const graph = normalizeGraph(template.graph);

  // Lock the (org, name) version group so two concurrent imports of the same template can't both read the same MAX(version) and collide on…
  await client.query(
    `SELECT id FROM workflow_definitions
      WHERE organization_id = $1 AND name = $2 FOR UPDATE`,
    [orgId, name],
  );

  // New draft: org-stamped explicitly, version = MAX(version)+1 for this
  // (org, name) (COALESCE → 1 for the first import), is_active = FALSE.
  const draft = await client.query<{ id: number; version: number }>(
    `INSERT INTO workflow_definitions (organization_id, name, version, is_active, created_by)
     VALUES (
       $1, $2,
       (SELECT COALESCE(MAX(version), 0) + 1 FROM workflow_definitions
         WHERE organization_id = $1 AND name = $2),
       FALSE, $3
     )
     RETURNING id, version`,
    [orgId, name, staffId],
  );
  const draftId = draft.rows[0].id;

  // Re-mint every template node id; remap edges through the same map. The
  // cloned nodes/edges have no org column — the org-verified draftId fk is
  // their tenant scope.
  const idMap = new Map<string, string>(graph.nodes.map((n) => [n.id, deps.newId('n')]));
  for (const n of graph.nodes) {
    await client.query(
      `INSERT INTO workflow_nodes (id, workflow_definition_id, type, position_x, position_y, config)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idMap.get(n.id), draftId, n.type, n.x, n.y, JSON.stringify(n.config ?? {})],
    );
  }
  // Only edges whose endpoints both resolve in the id map are kept (a malformed
  // template edge can't smuggle a dangling reference into the org's draft).
  let edgeCount = 0;
  for (const e of graph.edges) {
    const source = idMap.get(e.source);
    const target = idMap.get(e.target);
    if (!source || !target) continue;
    await client.query(
      `INSERT INTO workflow_edges (id, workflow_definition_id, source_node, source_port, target_node)
       VALUES ($1, $2, $3, $4, $5)`,
      [deps.newId('e'), draftId, source, e.sourcePort, target],
    );
    edgeCount += 1;
  }

  return {
    status: 200 as const,
    body: { ok: true, id: draftId, version: draft.rows[0].version },
    audit: {
      draftId,
      templateId,
      templateSlug: template.slug,
      name,
      version: draft.rows[0].version,
      nodes: graph.nodes.length,
      edges: edgeCount,
    },
  };
}
