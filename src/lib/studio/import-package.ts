/**
 * import-package — install a CycleForgeTemplatePackage (Phase 3) into an org.
 *
 * This is the "validate → persist → call the ONE installer" path the Phase 1–2
 * APIs were designed for — NOT a third clone path. A validated package is
 * persisted as a NON-system `workflow_templates` row (the durable Neon artifact;
 * invisible to the system library, which lists is_system = true only), then
 * installTemplateIntoOrg clones it exactly like any template — but ALWAYS as a
 * draft (`activate: 'never'`): custom / import / AI packages never auto-activate,
 * the owner reviews + publishes via the human gate.
 *
 * Validation (registered node/surface types only) is the route's job via
 * validateTemplatePackage; this module assumes an already-validated package.
 * Deps-injected so it unit-tests DB-free.
 *
 * Caveat: the template INSERT is a global write and the install is a separate
 * tenant tx; if the install fails after persist, an orphan non-system template
 * row remains (invisible, harmless). Phase 4 visibility/review curation absorbs
 * these; not worth a cross-scope tx here.
 */

import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { installTemplateIntoOrg } from './install-template';
import type { TemplatePackageV1 } from './template-package';

export interface ImportTemplatePackageArgs {
  orgId: OrgId;
  staffId: number;
  package: TemplatePackageV1;
  /** Optional name for the org's cloned draft; omitted → the package name. */
  nameOverride?: string;
}

export interface ImportTemplatePackageResult {
  status: 200 | 404 | 409 | 500;
  seeded: boolean;
  definitionId: number | null;
  version: number | null;
  surfacesSeeded: number;
  /** The persisted template slug (may be suffixed to stay globally unique). */
  templateSlug: string | null;
  reason?: string;
}

export interface ImportTemplatePackageDeps {
  /** Persist the package as a non-system template row; returns its id + final slug. */
  persistTemplate: (pkg: TemplatePackageV1) => Promise<{ templateId: number; slug: string }>;
  install: typeof installTemplateIntoOrg;
}

/**
 * Real persistence: INSERT the package as a non-system, non-default
 * workflow_templates row. `slug` is globally UNIQUE (ux_workflow_templates_slug),
 * so retry with a numeric suffix on conflict (mirrors signup's uniqueSlug).
 */
async function persistPackageAsTemplate(pkg: TemplatePackageV1): Promise<{ templateId: number; slug: string }> {
  const base = pkg.metadata.slug;
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const res = await pool.query<{ id: number }>(
      `INSERT INTO workflow_templates (slug, name, description, category, graph, is_system, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, FALSE, FALSE)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [
        candidate,
        pkg.metadata.name,
        pkg.metadata.description ?? null,
        pkg.metadata.category ?? null,
        JSON.stringify(pkg.graph),
      ],
    );
    if (res.rows[0]) return { templateId: Number(res.rows[0].id), slug: candidate };
  }
  throw new Error('could not allocate a unique template slug');
}

const defaultDeps: ImportTemplatePackageDeps = {
  persistTemplate: persistPackageAsTemplate,
  install: installTemplateIntoOrg,
};

export async function importTemplatePackage(
  args: ImportTemplatePackageArgs,
  deps: ImportTemplatePackageDeps = defaultDeps,
): Promise<ImportTemplatePackageResult> {
  const { templateId, slug } = await deps.persistTemplate(args.package);

  const outcome = await deps.install({
    orgId: args.orgId,
    staffId: args.staffId,
    templateId,
    name: args.nameOverride,
    activate: 'never', // packages ALWAYS land a draft.
  });

  return {
    status: outcome.status,
    seeded: outcome.seeded,
    definitionId: outcome.definitionId,
    version: outcome.version,
    surfacesSeeded: outcome.surfacesSeeded,
    templateSlug: slug,
    reason: outcome.reason,
  };
}
