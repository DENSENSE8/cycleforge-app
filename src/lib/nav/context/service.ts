/**
 * The server side of `GET /api/nav/context`: load the two per-request inputs
 * the pure resolver cannot know (the org's nav override and the page's
 * `nav.contextual.<pageId>` switch), then resolve.
 *
 * Cost: one tenant query (nav override + the staffer's switch value, one
 * statement) plus the in-process-cached organization row.
 */

import type { Entitlements } from '@/lib/billing/plans';
import { getEntitlements } from '@/lib/billing/entitlements';
import { parseNavDefinition } from '@/lib/nav/org-nav';
import { settingByKey } from '@/lib/settings/registry';
import { resolveSetting } from '@/lib/settings/resolve';
import { getSidebarNavPageId } from '@/lib/sidebar-navigation';
import { getOrganization } from '@/lib/tenancy/organizations';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveNavContext } from './resolve';
import { navRolloutOverride, navRolloutSettingKey } from './rollout';
import type { NavContext, NavContextQuery } from './schema';

export interface NavContextInputs {
  /** Raw `nav_definitions.config` of the org's active row, or null. */
  navConfig: unknown;
  /** The staffer's raw value for the page's switch key, or null. */
  staffSetting: unknown;
}

export interface NavContextDeps {
  loadInputs(orgId: OrgId, staffId: number, settingKey: string): Promise<NavContextInputs>;
  loadOrg(orgId: OrgId): Promise<{
    settings: Record<string, unknown>;
    features: Entitlements['features'];
  }>;
}

const defaultDeps: NavContextDeps = {
  async loadInputs(orgId, staffId, settingKey) {
    const { rows } = await tenantQueryOneTrip<{ nav_config: unknown; staff_setting: unknown }>(
      orgId,
      `SELECT
         (SELECT nd.config FROM nav_definitions nd
           WHERE nd.organization_id = $1 AND nd.is_active = TRUE
           ORDER BY nd.version DESC LIMIT 1) AS nav_config,
         (SELECT sp.prefs -> $3::text FROM staff_preferences sp
           WHERE sp.organization_id = $1 AND sp.staff_id = $2
           LIMIT 1) AS staff_setting`,
      [orgId, staffId, settingKey],
    );
    return { navConfig: rows[0]?.nav_config ?? null, staffSetting: rows[0]?.staff_setting ?? null };
  },
  async loadOrg(orgId) {
    const [org, entitlements] = await Promise.all([getOrganization(orgId), getEntitlements(orgId)]);
    return { settings: org?.settings ?? {}, features: entitlements.features };
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
  const pageId = getSidebarNavPageId(url.pathname, url.searchParams);
  const settingKey = navRolloutSettingKey(pageId);
  const [inputs, org] = await Promise.all([
    deps.loadInputs(request.orgId, request.staffId, settingKey),
    deps.loadOrg(request.orgId),
  ]);

  const def = settingByKey(settingKey);
  const override = def
    ? navRolloutOverride(
        resolveSetting(def, {
          orgSettings: org.settings,
          staffPrefs: { [settingKey]: inputs.staffSetting },
          features: org.features,
        }),
      )
    : null;

  return resolveNavContext({
    pathname: url.pathname,
    params: url.searchParams,
    permissions: request.permissions,
    orgNav: parseNavDefinition(inputs.navConfig),
    rolloutOverrides: override ? { [pageId]: override } : undefined,
    view: request.view,
  });
}
