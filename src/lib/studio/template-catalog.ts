/**
 * Template catalog → apply-to-org. THIN wrapper over installTemplateIntoOrg
 * (install-template.ts) — the single clone + surface-seed + activate path
 * (Template Platform Phase 2A). This module now only exists to preserve the
 * older boolean-`activate` programmatic signature for pick-a-vertical callers;
 * all real work lives in the installer.
 *
 * Two postures, unchanged:
 *   - Onboarding first-seed (via seedDefaultWorkflowForOrg): default template,
 *     activate=true, skipIfExists=true — a system template boots live.
 *   - Pick-a-vertical (programmatic): explicit templateId, activate=false —
 *     lands a DRAFT the owner reviews + publishes via the human gate (the HTTP
 *     equivalent is POST /api/studio/templates/[id]/import).
 *
 * The boolean maps to the installer's policy: activate=true → 'always',
 * activate=false → 'never'. (System vs custom activation nuance is the chooser's
 * job via 'if_system'; this legacy shim keeps its explicit boolean semantics.)
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { installTemplateIntoOrg } from './install-template';

export interface ApplyTemplateToOrgArgs {
  orgId: OrgId;
  staffId: number | null;
  /** Explicit template; omitted → the blessed default system template. */
  templateId?: number;
  /** Set the cloned definition active. Onboarding first-seed only (a fresh name group). */
  activate?: boolean;
  /** No-op if the org already has ANY workflow definition (idempotent onboarding). */
  skipIfExists?: boolean;
}

export interface ApplyTemplateToOrgResult {
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
