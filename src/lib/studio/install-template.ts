/** install-template — the ONE path that lands a workflow_templates blueprint into an org (Template Platform Phase 2A). */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { createDraftFromTemplate } from './templates';
import { buildTemplateSurfaceSeeds, seedTemplateSurfaces } from './template-surfaces';

type TxClient = Pick<PoolClient, 'query'>;

/** When the cloned definition should be flipped is_active = TRUE. */
export type ActivatePolicy =
  /** Never activate — always land a draft (import / custom / AI package). */
  | 'never'
  /** Activate only when the source template is a system-owned blueprint. */
  | 'if_system'
  /** Always activate on successful clone+seed (onboarding first-seed of a known template). */
  | 'always';

export interface InstallTemplateArgs {
  orgId: OrgId;
  /** workflow_definitions.created_by / station_definitions.updated_by for the seeded rows. */
  staffId: number | null;
  /** Explicit template; omitted → the blessed default (is_default) system template. */
  templateId?: number;
  /** Optional name override for the new definition; omitted → the template's name. */
  name?: string;
  /** Activation policy (see {@link ActivatePolicy}). */
  activate: ActivatePolicy;
  /** No-op if the org already has ANY workflow definition (idempotent onboarding seed). */
  skipIfExists?: boolean;
}

export interface InstallTemplateResult {
  status: 200 | 404 | 409 | 500;
  /** True once a definition was actually cloned (false on skip / clone failure). */
  seeded: boolean;
  definitionId: number | null;
  version: number | null;
  templateId: number | null;
  templateSlug: string | null;
  /** The resolved definition name (template name unless overridden). */
  name: string | null;
  nodes: number;
  edges: number;
  /** Count of station_definition drafts seeded from the cloned surfaces. */
  surfacesSeeded: number;
  activated: boolean;
  reason?: string;
}

/** Injectable collaborators (real impls by default; fakes in tests). */
export interface InstallTemplateDeps {
  runTransaction: <T>(orgId: OrgId, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  createDraft: typeof createDraftFromTemplate;
  buildSeeds: typeof buildTemplateSurfaceSeeds;
  seedSurfaces: typeof seedTemplateSurfaces;
}

const defaultDeps: InstallTemplateDeps = {
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client)),
  createDraft: createDraftFromTemplate,
  buildSeeds: buildTemplateSurfaceSeeds,
  seedSurfaces: seedTemplateSurfaces,
};

/** The nothing-installed skeleton, spread into every early-return. */
const EMPTY = {
  seeded: false as const,
  definitionId: null,
  version: null,
  templateSlug: null,
  name: null,
  nodes: 0,
  edges: 0,
  surfacesSeeded: 0,
  activated: false,
};

export async function installTemplateIntoOrg(
  args: InstallTemplateArgs,
  deps: InstallTemplateDeps = defaultDeps,
): Promise<InstallTemplateResult> {
  const { orgId, staffId, name, activate, skipIfExists = false } = args;

  return deps.runTransaction(orgId, async (client) => {
    // 1. Idempotent onboarding seed: skip when the org already has a definition.
    if (skipIfExists) {
      const already = await client.query(
        `SELECT 1 FROM workflow_definitions WHERE organization_id = $1 LIMIT 1`,
        [orgId],
      );
      if (already.rows[0]) {
        return { status: 200 as const, ...EMPTY, templateId: null, reason: 'org already has a definition' };
      }
    }

    // 2. Resolve the template id + its is_system flag (drives the if_system policy).
    //    Global table — no org predicate by design.
    let templateId = args.templateId;
    let isSystem = false;
    if (templateId == null) {
      const tpl = await client.query<{ id: number | string; is_system: boolean }>(
        `SELECT id, is_system FROM workflow_templates WHERE is_system = true ORDER BY is_default DESC, id LIMIT 1`,
      );
      if (!tpl.rows[0]) {
        return { status: 404 as const, ...EMPTY, templateId: null, reason: 'no system template seeded' };
      }
      templateId = Number(tpl.rows[0].id);
      isSystem = Boolean(tpl.rows[0].is_system);
    } else {
      const tpl = await client.query<{ is_system: boolean }>(
        `SELECT is_system FROM workflow_templates WHERE id = $1`,
        [templateId],
      );
      if (!tpl.rows[0]) {
        return { status: 404 as const, ...EMPTY, templateId, reason: 'template not found' };
      }
      isSystem = Boolean(tpl.rows[0].is_system);
    }

    // 3. Clone the template into a new is_active = FALSE draft (never rewritten).
    const result = await deps.createDraft({ client: client as never, orgId, staffId: staffId as never, templateId, name });
    if (result.status !== 200) {
      const reason = 'body' in result && result.body.ok === false ? result.body.error : 'clone failed';
      return { status: result.status, ...EMPTY, templateId, reason };
    }
    const definitionId = result.body.id;
    const audit = result.audit;

    // 4. Seed the surfaces the cloned node types imply. The re-minted node ids are
    //    already global; the identity map binds each surface to the node it came from.
    const { rows } = await client.query<{ id: string; type: string }>(
      `SELECT id, type FROM workflow_nodes WHERE workflow_definition_id = $1`,
      [definitionId],
    );
    const nodes = rows.map((n) => ({ id: n.id, type: n.type, x: 0, y: 0 }));
    const identityMap = new Map(nodes.map((n) => [n.id, n.id]));
    const seeds = deps.buildSeeds(nodes, identityMap);
    const surfacesSeeded = await deps.seedSurfaces(client, orgId, staffId as never, seeds);

    // 5. Apply the activate policy (only ever on a successful clone+seed).
    let activated = false;
    const shouldActivate = activate === 'always' || (activate === 'if_system' && isSystem);
    if (shouldActivate) {
      // The clone lands under the template's own NAME group, is_active = FALSE.
      // Activating a fresh name group is safe (the invariant is one active per
      // (org, name)); a first-seed / chooser install is the org's only definition.
      await client.query(
        `UPDATE workflow_definitions SET is_active = TRUE WHERE id = $1 AND organization_id = $2`,
        [definitionId, orgId],
      );
      activated = true;
    }

    return {
      status: 200 as const,
      seeded: true,
      definitionId,
      version: result.body.version,
      templateId,
      templateSlug: audit.templateSlug,
      name: audit.name,
      nodes: audit.nodes,
      edges: audit.edges,
      surfacesSeeded,
      activated,
    };
  });
}
