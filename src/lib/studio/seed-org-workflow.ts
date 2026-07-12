/**
 * seed-org-workflow — dogfood / script backfill only.
 *
 * Clones the default SYSTEM workflow template into an org and activates it, so
 * the node-graph engine can route intake out-of-the-box. Thin wrapper over
 * installTemplateIntoOrg (the single clone + surface-seed + activate path) with
 * the seed posture: default template, activate only if system, skip-if-exists.
 *
 * NOTE (Template Platform Phase 1): this is NO LONGER the live signup path.
 * Signup no longer auto-seeds a live graph — a brand-new org chooses its ops SOP
 * template at onboarding (POST /api/onboarding/template → installTemplateIntoOrg).
 * Keep this helper for dogfood seeding and backfill scripts (and existing
 * grandfathered orgs); it is best-effort and idempotent, never a request blocker.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { installTemplateIntoOrg } from './install-template';

export async function seedDefaultWorkflowForOrg(orgId: OrgId, staffId: number): Promise<void> {
  await installTemplateIntoOrg({ orgId, staffId, activate: 'if_system', skipIfExists: true });
}
