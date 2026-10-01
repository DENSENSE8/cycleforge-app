/**
 * The server side of `GET /api/nav/context`: load the two per-request inputs
 * the pure resolver cannot know (the org's nav override), then resolve.
 *
 * Cost: one tenant query (nav override + active capabilities, one statement).
 */

import { parseNavDefinition } from '@/lib/nav/org-nav';
import { hiddenNavItemIds } from '@/lib/capabilities/catalog';
import { ACTIVE_CAPABILITIES_SUBQUERY_SQL, withCapabilityGate } from '@/lib/capabilities/nav-gate';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveNavContext } from './resolve';
import type { NavContext, NavContextQuery } from './schema';

export interface NavContextInputs {
  /** Raw `nav_definitions.config` of the org's active row, or null. */
  navConfig: unknown;
  /** The org's ACTIVE capability ids (SIMPLE-FIRST gate); absent = no gate. */
  activeCapabilities?: string[];
}

export interface NavContextDeps {
  loadInputs(orgId: OrgId): Promise<NavContextInputs>;
}

const defaultDeps: NavContextDeps = {
  async loadInputs(orgId) {
    const { rows } = await tenantQueryOneTrip<{ nav_config: unknown; active_capabilities: string[] }>(
      orgId,
      `SELECT
         (SELECT nd.config FROM nav_definitions nd
           WHERE nd.organization_id = $1 AND nd.is_active = TRUE
           ORDER BY nd.version DESC LIMIT 1) AS nav_config,
         ${ACTIVE_CAPABILITIES_SUBQUERY_SQL} AS active_capabilities`,
      [orgId],
    );
    return {
      navConfig: rows[0]?.nav_config ?? null,
      activeCapabilities: rows[0]?.active_capabilities ?? [],
    };
  },
};

export interface NavContextRequest extends NavContextQuery {
  orgId: OrgId;
  staffId: number;
  permissions: ReadonlySet<string>;
}

/** The session's `NavContext` for `path` — what the web shell resolves in-process. */
export async function getNavContextForStaff(
  request: NavContextRequest,
  deps: NavContextDeps = defaultDeps,
): Promise<NavContext> {
  const url = new URL(request.path, 'http://nav.local');
  const inputs = await deps.loadInputs(request.orgId);

  return resolveNavContext({
    pathname: url.pathname,
    params: url.searchParams,
    permissions: request.permissions,
    orgNav: withCapabilityGate(
      parseNavDefinition(inputs.navConfig),
      inputs.activeCapabilities ? hiddenNavItemIds(inputs.activeCapabilities) : null,
    ),
    view: request.view,
  });
}
