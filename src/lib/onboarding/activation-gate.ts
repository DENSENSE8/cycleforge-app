/**
 * Activation gate — first-run funnel before empty operator desks.
 *
 * A new org without an active workflow (`workflow_definitions.is_active`) must
 * land on `/onboarding/template`, not an empty `/incoming` skeleton or My Day.
 * Mirrors the trial-gate shape (pure allowlist + injectable deps) but is always
 * on — there is no env kill-switch; dogfood orgs with a workflow are unaffected.
 *
 * Fail-open: if the workflow probe throws / cannot be trusted, do NOT redirect.
 * We deliberately do **not** use `getOnboardingStats` here — that helper
 * degrade-to-zeros on DB error, which would falsely treat mature orgs as
 * template-less during a blip.
 *
 * Wired into:
 *   - `requirePermission` (page.tsx choke points)
 *   - root layout (covers desks that skip page-guard, e.g. `/`, `/incoming`)
 *
 * The DB probe is dynamically imported so unit tests of the pure decision stay
 * free of `server-only` / Neon.
 */

import { cache } from 'react';
import type { OrgId } from '@/lib/tenancy/constants';

/** Paths that must stay reachable before a workflow template is chosen. */
const EXEMPT_PREFIXES = [
  '/onboarding',
  '/settings',
  '/api',
  '/signin',
  '/signup',
  '/signout',
  '/not-authorized',
];

export function isActivationPathExempt(pathname: string): boolean {
  const path = (pathname || '/').split('?')[0] || '/';
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Probe for an active workflow. Throws on transport/DB failure so the gate
 * can fail-open — never conflate "query failed" with "no workflow."
 * Request-scoped via `cache` so root layout + requirePermission share one read.
 */
const probeHasActiveWorkflow = cache(async (orgId: OrgId): Promise<boolean> => {
  const { withTenantTransaction } = await import('@/lib/tenancy/db');
  return withTenantTransaction(orgId, async (client) => {
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM workflow_definitions
          WHERE organization_id = $1 AND is_active = TRUE
       ) AS ok`,
      [orgId],
    );
    return Boolean(rows[0]?.ok);
  });
});

export interface ActivationGateDeps {
  probeHasActiveWorkflow: (orgId: OrgId) => Promise<boolean>;
}

const defaultDeps: ActivationGateDeps = {
  probeHasActiveWorkflow,
};

/**
 * True when this authenticated org should be redirected to onboarding.
 * Exempt paths and probe failures never block.
 */
export async function isActivationBlocked(
  orgId: OrgId,
  pathname: string,
  deps: ActivationGateDeps = defaultDeps,
): Promise<boolean> {
  if (isActivationPathExempt(pathname)) return false;
  try {
    const hasActiveWorkflow = await deps.probeHasActiveWorkflow(orgId);
    return !hasActiveWorkflow;
  } catch (error) {
    console.error('activation gate probe failed (fail-open):', error);
    return false;
  }
}

/** Destination for blocked tenants — template chooser (thin `/onboarding` forwards here). */
export const ACTIVATION_REDIRECT_HREF = '/onboarding/template';
