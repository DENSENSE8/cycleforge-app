/**
 * Design Lab entitlement — server-only.
 *
 * Two locks, both required:
 *   1. the session's org IS the QA sandbox (`…0002`, src/lib/tenancy/qa-org.ts), and
 *   2. `organization_feature_flags(flag='design_lab')` is enabled for it.
 *
 * Fail-CLOSED: an unset row, another tenant, or a signed-out request all resolve
 * to `false`. The org check runs first so dogfood/USAV never pays for a flag
 * read — this is called from the ROOT layout on every request.
 *
 * Callers: `src/app/qa/design-lab/layout.tsx` (404s the route tree) and
 * `src/app/layout.tsx` (decides whether the reskin stylesheet, boot script and
 * HUD ship at all). Both must agree, so there is exactly one function.
 */

import { readOrgFeatureFlag } from '@/lib/feature-flags';
import { QA_ORG_ID } from '@/lib/tenancy/qa-org';
import type { OrgId } from '@/lib/tenancy/constants';
import { DESIGN_LAB_FLAG } from './constants';

export { DESIGN_LAB_FLAG, DESIGN_LAB_HREF, DESIGN_LAB_SPLIT_HREF } from './constants';

/** Cheap synchronous half — no DB. */
export function isDesignLabOrg(orgId: OrgId | null | undefined): boolean {
  return orgId === QA_ORG_ID;
}

/** Full gate. `false` for every non-QA tenant without touching the database. */
export async function resolveDesignLabAccess(
  orgId: OrgId | null | undefined,
): Promise<boolean> {
  if (!isDesignLabOrg(orgId)) return false;
  return (await readOrgFeatureFlag(orgId as OrgId, DESIGN_LAB_FLAG)) === true;
}
