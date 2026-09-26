/** Entitlement-gate dispatcher for the `withAuth({ feature })` hook. */

import type { Entitlements } from './plans';
import type { OrgId } from '../tenancy/constants';
import { isStudioGated } from './studio-gate';
import { makePlanFeatureGate } from './plan-feature-gate';

export type EntitlementFeature = keyof Entitlements['features'];

/** Map of feature → its block-decision fn. */
const FEATURE_GATES: Partial<
  Record<EntitlementFeature, (orgId: OrgId | null | undefined) => Promise<boolean>>
> = {
  studio: isStudioGated,
  fba: makePlanFeatureGate('fba'),
  repair: makePlanFeatureGate('repair'),
  walkIn: makePlanFeatureGate('walkIn'),
  sourcing: makePlanFeatureGate('sourcing'),
  support: makePlanFeatureGate('support'),
  aiChat: makePlanFeatureGate('aiChat'),
};

/**
 * True if the request should be blocked for lacking `feature`. Returns false
 * (allowed) for any feature without a registered gate, and each gate is itself
 * permissive-by-default + fail-open, so this never hard-locks a tenant out.
 */
export async function isFeatureGated(
  feature: EntitlementFeature,
  orgId: OrgId | null | undefined,
): Promise<boolean> {
  const gate = FEATURE_GATES[feature];
  if (!gate) return false;
  return gate(orgId);
}
