/** Resolve the current entitlements for a tenant. */

import { getOrganization } from '../tenancy/organizations';
import type { OrgId } from '../tenancy/constants';
import { entitlementsForPlan, type Entitlements } from './plans';

export async function getEntitlements(orgId: OrgId): Promise<Entitlements> {
  const org = await getOrganization(orgId);
  if (!org) return entitlementsForPlan('trial');
  return entitlementsForPlan(org.plan);
}

export async function hasFeature(
  orgId: OrgId,
  feature: keyof Entitlements['features'],
): Promise<boolean> {
  const ent = await getEntitlements(orgId);
  return ent.features[feature];
}

export class FeatureGatedError extends Error {
  constructor(public readonly feature: keyof Entitlements['features']) {
    super(`Feature "${feature}" requires a higher plan.`);
    this.name = 'FeatureGatedError';
  }
}

export async function requireFeature(
  orgId: OrgId,
  feature: keyof Entitlements['features'],
): Promise<void> {
  if (!(await hasFeature(orgId, feature))) {
    throw new FeatureGatedError(feature);
  }
}
