/** `GET /api/nav/facets` domain — option counts for one facet context, from the list's own predicates. */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_PERMISSION, mayReadNavFacet, type NavFacetContext } from '@/lib/nav/facets/contexts';
import { exceptionFacets, isExceptionFacetContext, type ExceptionCountReader } from '@/lib/nav/facets/exceptions';
import { countExceptions } from '@/lib/exceptions/hub';
import { isLiveFeedFacetContext, liveFeedFacets, type LiveFeedCountReader } from '@/lib/nav/facets/live-feed';
import { countLiveFeedStatuses } from '@/lib/live-feed/load';
import { importFacets } from '@/lib/nav/facets/imports';
import { outboundFacets, type FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { pickupFacets } from '@/lib/nav/facets/pickup';
import { inventoryStockFacets } from '@/lib/nav/facets/inventory-stock';
import { shippedFacets } from '@/lib/nav/facets/shipped';
import { stationLiveFacets } from '@/lib/nav/facets/station-live';
import { listLocalPickupLines } from '@/lib/local-pickup/pickup-lines-query';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface NavFacetsDeps {
  /** One tenant-scoped statement → rows. */
  run(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
  listLocalPickupLines: typeof listLocalPickupLines;
  /** The Exceptions hub's per-kind totals (`countExceptions`). */
  exceptionCounts: ExceptionCountReader;
  /** The Live feed's status counts and Carrier / Channel tallies (`countLiveFeedStatuses`). */
  liveFeedCounts: LiveFeedCountReader;
}

export const defaultNavFacetsDeps: NavFacetsDeps = {
  run: async (orgId, sql, params) => (await tenantQuery(orgId, sql, params)).rows,
  listLocalPickupLines,
  exceptionCounts: (caller, kinds, q) => countExceptions(caller, kinds, q),
  liveFeedCounts: countLiveFeedStatuses,
};

export async function getNavFacets(
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  context: NavFacetContext,
  params: Pick<URLSearchParams, 'get'>,
  deps: NavFacetsDeps = defaultNavFacetsDeps,
): Promise<{ ok: true; body: NavFacetsResponse } | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string }> {
  if (!mayReadNavFacet(caller.permissions, context)) {
    const required = NAV_FACET_PERMISSION[context];
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: typeof required === 'string' ? required : required.join('|') };
  }
  if (isExceptionFacetContext(context)) {
    const has = (permission: string) => caller.permissions.has(permission);
    return { ok: true, body: await exceptionFacets(context, { orgId: caller.orgId, has }, params, deps.exceptionCounts) };
  }
  if (isLiveFeedFacetContext(context)) {
    return { ok: true, body: await liveFeedFacets(context, caller, params, deps.liveFeedCounts) };
  }
  if (context === 'pickup') {
    return { ok: true, body: await pickupFacets(caller.orgId, params, deps.listLocalPickupLines) };
  }
  const run: FacetSqlRunner = (sql, bind) => deps.run(caller.orgId, sql, bind);
  if (context === 'stations-live') return { ok: true, body: await stationLiveFacets(caller.orgId, params, run) };
  if (context === 'inventory.stock') return { ok: true, body: await inventoryStockFacets(caller.orgId, params, run) };
  if (context === 'outbound.shipped') return { ok: true, body: await shippedFacets(caller.orgId, params, run) };
  if (context === 'imports.runs' || context === 'imports.rows') {
    return { ok: true, body: await importFacets(context, caller.orgId, params, run) };
  }
  return { ok: true, body: await outboundFacets(context, caller.orgId, params, run) };
}
