/** Generic plan-tier entitlement gate for the simple "Growth+" paid features (walkIn, sourcing, support, aiChat). */

import { hasFeature } from './entitlements';
import { readOrgFeatureFlag } from '../feature-flags';
import { DOGFOOD_ORG_ID, type OrgId } from '../tenancy/constants';
import type { EntitlementFeature } from './feature-gate';

/** Env var that flips Growth+ plan-feature enforcement from dormant → live. */
export const PLAN_FEATURE_ENFORCEMENT_ENV = 'PLAN_FEATURE_ENFORCED';

/**
 * The dogfood / internal org that runs the live deployment — exempt from
 * plan-feature gating ALWAYS, so we can never lock ourselves out. Org #1.
 */
export const PLAN_FEATURE_EXEMPT_ORG_ID: OrgId = DOGFOOD_ORG_ID;

/**
 * True only when `PLAN_FEATURE_ENFORCED` is explicitly truthy. Default OFF —
 * when off, every gate from this factory is a pass-through.
 */
export function planFeatureEnforced(): boolean {
  const v = (process.env[PLAN_FEATURE_ENFORCEMENT_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/** The dogfood/internal org is always exempt from plan-feature gating. */
export function isPlanFeatureExemptOrg(orgId: OrgId | null | undefined): boolean {
  return orgId === PLAN_FEATURE_EXEMPT_ORG_ID;
}

/** Build the block-decision fn for one Growth+ feature. */
export function makePlanFeatureGate(
  feature: EntitlementFeature,
): (orgId: OrgId | null | undefined) => Promise<boolean> {
  return async function isGated(orgId: OrgId | null | undefined): Promise<boolean> {
    // 1. Dormant by default — short-circuit before any DB read.
    if (!planFeatureEnforced()) return false;

    // 2. Unknown org (anonymous context) and the dogfood org are never gated.
    if (!orgId || isPlanFeatureExemptOrg(orgId)) return false;

    try {
      // 3. Per-org override flag force-grants regardless of plan.
      const override = await readOrgFeatureFlag(orgId, feature);
      if (override === true) return false;

      // 4. Plan capability.
      if (await hasFeature(orgId, feature)) return false;

      // 5. No exemption, no override, plan lacks the capability → gated.
      return true;
    } catch (err) {
      console.warn(
        `[plan-feature-gate] entitlement check failed for ${feature}/${orgId}; failing open:`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  };
}
