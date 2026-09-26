/**
 * Operations Studio entitlement gate — the MECHANISM (Part-2 Track 2).
 * the entitlement/upsell surface, not a security boundary.
 */

import { hasFeature } from './entitlements';
import { readOrgFeatureFlag } from '../feature-flags';
import { DOGFOOD_ORG_ID, type OrgId } from '../tenancy/constants';

/** Env var that flips Studio entitlement enforcement from dormant → live. */
export const STUDIO_ENFORCEMENT_ENV = 'STUDIO_ENTITLEMENT_ENFORCED';

/** Per-org override flag name in `organization_feature_flags`. */
export const STUDIO_ORG_FLAG = 'studio';

/** The dogfood / internal org that runs the live deployment. */
export { DOGFOOD_ORG_ID };

/**
 * True only when `STUDIO_ENTITLEMENT_ENFORCED` is explicitly truthy. Default
 * OFF — when off, the entire gate is a pass-through.
 */
export function studioEntitlementEnforced(): boolean {
  const v = (process.env[STUDIO_ENFORCEMENT_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/** The dogfood/internal org is always exempt from Studio gating. */
export function isStudioExemptOrg(orgId: OrgId | null | undefined): boolean {
  return orgId === DOGFOOD_ORG_ID;
}

/**
 * Injectable collaborators so the resolver is unit-testable without a DB. The
 * defaults are the real impls; tests pass fakes that capture/return without I/O.
 */
export interface StudioGateDeps {
  enforced: () => boolean;
  isExempt: (orgId: OrgId | null | undefined) => boolean;
  readOverrideFlag: (orgId: OrgId, flag: string) => Promise<boolean | null>;
  planHasStudio: (orgId: OrgId) => Promise<boolean>;
}

const defaultDeps: StudioGateDeps = {
  enforced: studioEntitlementEnforced,
  isExempt: isStudioExemptOrg,
  readOverrideFlag: readOrgFeatureFlag,
  planHasStudio: (orgId) => hasFeature(orgId, 'studio'),
};

/** True if this org should be BLOCKED from the Studio surface. */
export async function isStudioGated(
  orgId: OrgId | null | undefined,
  deps: StudioGateDeps = defaultDeps,
): Promise<boolean> {
  // 1. Dormant by default — short-circuit before any DB read.
  if (!deps.enforced()) return false;

  // 2. Unknown org (anonymous context) and the dogfood org are never gated.
  if (!orgId || deps.isExempt(orgId)) return false;

  try {
    // 3. Per-org override flag force-grants regardless of plan.
    const override = await deps.readOverrideFlag(orgId, STUDIO_ORG_FLAG);
    if (override === true) return false;

    // 4. Plan capability. Granted on every current plan by default, so this is
    //    only ever false once the plan ladder is tightened.
    if (await deps.planHasStudio(orgId)) return false;

    // 5. No exemption, no override, plan lacks the capability → gated.
    return true;
  } catch (err) {
    console.warn(
      `[studio-gate] entitlement check failed for ${orgId}; failing open:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
