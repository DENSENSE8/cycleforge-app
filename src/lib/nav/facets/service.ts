/** `GET /api/nav/facets` domain — option counts for one facet context, from the list's own predicates. */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_PERMISSION, type NavFacetContext } from '@/lib/nav/facets/contexts';
import { importFacets } from '@/lib/nav/facets/imports';
import { outboundFacets, type FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { pickupFacets } from '@/lib/nav/facets/pickup';
import { shippedFacets } from '@/lib/nav/facets/shipped';
import { listLocalPickupLines } from '@/lib/local-pickup/pickup-lines-query';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface NavFacetsDeps {
  /** One tenant-scoped statement → rows. */
  run(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
  listLocalPickupLines: typeof listLocalPickupLines;
}

export const defaultNavFacetsDeps: NavFacetsDeps = {
  run: async (orgId, sql, params) => (await tenantQuery(orgId, sql, params)).rows,
  listLocalPickupLines,
};

export async function getNavFacets(
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  context: NavFacetContext,
  params: Pick<URLSearchParams, 'get'>,
  deps: NavFacetsDeps = defaultNavFacetsDeps,
): Promise<{ ok: true; body: NavFacetsResponse } | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string }> {
  const permission = NAV_FACET_PERMISSION[context];
  if (!caller.permissions.has(permission)) return { ok: false, status: 403, error: 'FORBIDDEN', permission };
  if (context === 'pickup') {
    return { ok: true, body: await pickupFacets(caller.orgId, params, deps.listLocalPickupLines) };
  }
  const run: FacetSqlRunner = (sql, bind) => deps.run(caller.orgId, sql, bind);
  if (context === 'outbound.shipped') return { ok: true, body: await shippedFacets(caller.orgId, params, run) };
  if (context === 'imports.runs' || context === 'imports.rows') {
    return { ok: true, body: await importFacets(context, caller.orgId, params, run) };
  }
  return { ok: true, body: await outboundFacets(context, caller.orgId, params, run) };
}
