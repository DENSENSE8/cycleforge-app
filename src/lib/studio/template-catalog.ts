/** Template catalog → apply-to-org. */

import type { OrgId } from '@/lib/tenancy/constants';
import { installTemplateIntoOrg } from './install-template';

interface ApplyTemplateToOrgArgs {
  orgId: OrgId;
  staffId: number | null;
  /** Explicit template; omitted → the blessed default system template. */
  templateId?: number;
  /** Set the cloned definition active. Onboarding first-seed only (a fresh name group). */
  activate?: boolean;
  /** No-op if the org already has ANY workflow definition (idempotent onboarding). */
  skipIfExists?: boolean;
}

interface ApplyTemplateToOrgResult {
  status: 200 | 404 | 409 | 500;
  seeded: boolean;
  definitionId: number | null;
  activated: boolean;
  /** Surface drafts seeded alongside the graph (Phase 2A rollup). */
  surfacesSeeded: number;
  reason?: string;
}

/** Thin-wrapper deps — inject a fake installer to unit-test the mapping DB-free. */
export interface ApplyTemplateDeps {
  install: typeof installTemplateIntoOrg;
}

const defaultDeps: ApplyTemplateDeps = { install: installTemplateIntoOrg };

export async function applyTemplateToOrg(
  args: ApplyTemplateToOrgArgs,
  deps: ApplyTemplateDeps = defaultDeps,
): Promise<ApplyTemplateToOrgResult> {
  const { orgId, staffId, templateId, activate = false, skipIfExists = false } = args;

  const result = await deps.install({
    orgId,
    staffId,
    templateId,
    activate: activate ? 'always' : 'never',
    skipIfExists,
  });

  return {
    status: result.status,
    seeded: result.seeded,
    definitionId: result.definitionId,
    activated: result.activated,
    surfacesSeeded: result.surfacesSeeded,
    reason: result.reason,
  };
}
