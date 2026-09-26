/** Activation gate — first-run funnel before empty operator desks. */

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
  '/kiosk',
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
