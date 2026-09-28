/**
 * Activation gate — first-run funnel before empty operator desks.
 *
 * SIMPLE-FIRST (docs/product/SIMPLE-FIRST.md): an org that has neither an
 * active workflow nor a capability it switched on itself lands in the AI chat,
 * where it tells the assistant what it needs. Backfilled capabilities do not
 * count, so every org that existed before the capability ledger keeps the
 * exact gate it had.
 */

import { cache } from 'react';
import type { OrgId } from '@/lib/tenancy/constants';

/** Paths that must stay reachable before a workflow template is chosen. */
const EXEMPT_PREFIXES = [
  // The base capability — reachable before anything else is unlocked.
  '/ai-chat',
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
 * Probe for an active workflow or an org-enabled capability. Throws on
 * transport/DB failure so the gate can fail-open — never conflate "query
 * failed" with "not activated."
 * Request-scoped via `cache` so root layout + requirePermission share one read.
 */
const probeHasActiveWorkflow = cache(async (orgId: OrgId): Promise<boolean> => {
  const { withTenantTransaction } = await import('@/lib/tenancy/db');
  return withTenantTransaction(orgId, async (client) => {
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM workflow_definitions
          WHERE organization_id = $1 AND is_active = TRUE
       ) OR EXISTS (
         SELECT 1 FROM org_capabilities
          WHERE organization_id = $1 AND state = 'active' AND source <> 'backfill'
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

/**
 * Destination for blocked tenants — the chat-first home (SIMPLE-FIRST). The
 * template chooser stays reachable at `/onboarding/template`.
 */
export const ACTIVATION_REDIRECT_HREF = '/ai-chat';
