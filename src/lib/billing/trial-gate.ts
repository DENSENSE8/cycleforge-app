/** Trial-expiry enforcement — the "no free tier" gate. */

import { getOrganization } from '../tenancy/organizations';
import type { OrgId } from '../tenancy/constants';

function trialEnforcementOn(): boolean {
  const v = (process.env.TRIAL_ENFORCEMENT ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

// Paths that must stay reachable even with an expired trial: billing (to pay),
// auth (to sign in/out), and the not-authorized page.
const EXEMPT_PREFIXES = [
  '/settings/billing',
  '/api/billing',
  '/api/auth',
  '/signin',
  '/not-authorized',
];

export function isTrialPathExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isTrialExpired(org: { plan: string; trialEndsAt: Date | null }): boolean {
  return org.plan === 'trial' && org.trialEndsAt != null && org.trialEndsAt.getTime() < Date.now();
}

/**
 * Injectable collaborators so the decision logic unit-tests DB-free
 * (house `Deps` pattern — mirrors studio-gate.ts).
 */
export interface TrialGateDeps {
  enforced: () => boolean;
  getOrg: (orgId: OrgId) => Promise<{ plan: string; trialEndsAt: Date | null } | null>;
}

const defaultDeps: TrialGateDeps = {
  enforced: trialEnforcementOn,
  getOrg: getOrganization,
};

/**
 * True if this org should be blocked from `pathname`. No DB read when
 * enforcement is off or the path is exempt — the flag check short-circuits
 * first.
 */
export async function isTrialBlocked(
  orgId: OrgId,
  pathname: string,
  deps: TrialGateDeps = defaultDeps,
): Promise<boolean> {
  if (!deps.enforced()) return false;
  if (isTrialPathExempt(pathname)) return false;
  const org = await deps.getOrg(orgId);
  if (!org) return false;
  return isTrialExpired(org);
}
