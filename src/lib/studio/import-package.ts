/** import-package — install a CycleForgeTemplatePackage (Phase 3) into an org. */

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
