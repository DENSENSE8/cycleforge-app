/** `GET /api/nav/facets` domain — option counts for one facet context, from the list's own predicates. */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_PERMISSION, mayReadNavFacet, type NavFacetContext } from '@/lib/nav/facets/contexts';
import { exceptionFacets, isExceptionFacetContext, type ExceptionCountReader } from '@/lib/nav/facets/exceptions';
import { countExceptions } from '@/lib/exceptions/hub';
import { importFacets } from '@/lib/nav/facets/imports';
import { outboundFacets, type FacetSqlRunner } from '@/lib/nav/facets/outbound';
import { pickupFacets } from '@/lib/nav/facets/pickup';
import { inventoryStockFacets } from '@/lib/nav/facets/inventory-stock';
import { inventoryRackFacets } from '@/lib/nav/facets/inventory-racks';
import { incomingPipelineFacets } from '@/lib/nav/facets/incoming-pipeline';
import { getIncomingSummary } from '@/lib/receiving/incoming-summary';
import { incomingDockedFacets } from '@/lib/nav/facets/incoming-docked';
import { unboxFacets } from '@/lib/nav/facets/unbox';
import { purchasingFacets } from '@/lib/nav/facets/purchasing';
import { getNavPurchases } from '@/lib/nav/purchases/service';
import { fulfilledFacets } from '@/lib/nav/facets/fulfilled';
import { navFulfilledDeps } from '@/lib/nav/fulfilled/read';
import { getNavFulfilled } from '@/lib/nav/fulfilled/service';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import { fetchReceivingLinesPage, resolveReceivingLinesReadFlags } from '@/lib/receiving/lines/list-page';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isRepairFacetContext, repairFacets } from '@/lib/nav/facets/repair';
import { labelIntakeFilesFacets } from '@/lib/nav/facets/label-intake-files';
import { labelIntakeOrdersFacets } from '@/lib/nav/facets/label-intake-orders';
import { countOrderPackets } from '@/lib/label-prints/order-packets';
import { countPrintFiles } from '@/lib/label-prints/print-files';
import { stationLiveFacets } from '@/lib/nav/facets/station-live';
import { liveFeedFacets } from '@/lib/nav/facets/live-feed';
import type { LiveFeedFilters } from '@/lib/live-feed/route';
import type { LiveFeedFacets } from '@/lib/live-feed/types';
import { loadLiveFeedFacets } from '@/lib/live-feed/load';
import { isSupportFacetContext, supportFacets } from '@/lib/nav/facets/support';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { listSupportRows } from '@/lib/support/list/support-list-db';
import { listLocalPickupLines } from '@/lib/local-pickup/pickup-lines-query';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface NavFacetsDeps {
  /** One tenant-scoped statement → rows. */
  run(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
  listLocalPickupLines: typeof listLocalPickupLines;
  /** The Exceptions hub's per-kind totals (`countExceptions`). */
  exceptionCounts: ExceptionCountReader;
  /** The Support list's rows (`listSupportRows`), cut by the list's own predicates. */
  supportRows: (orgId: OrgId, q: string | null, nowMs: number) => Promise<SupportListRow[]>;
  /** The Live feed board's own facet read (`loadLiveFeedFacets`). */
  liveFeedFacets: (orgId: OrgId, filters: LiveFeedFilters) => Promise<LiveFeedFacets>;
}

export const defaultNavFacetsDeps: NavFacetsDeps = {
  run: async (orgId, sql, params) => (await tenantQuery(orgId, sql, params)).rows,
  listLocalPickupLines,
  exceptionCounts: (caller, kinds, q) => countExceptions(caller, kinds, q),
  supportRows: (orgId, q, nowMs) => sharedSupportRows(orgId, q, nowMs),
  liveFeedFacets: loadLiveFeedFacets,
};

/**
 * One /support load asks for the facets of every sidebar view at once (ten
 * contexts). They all read the same rows, so concurrent and back-to-back
 * requests for one org + find text share ONE `listSupportRows` read for a
 * couple of seconds instead of ten full scans.
 */
const SUPPORT_ROWS_SHARE_MS = 2_000;
const supportRowsShared = new Map<string, { at: number; rows: Promise<SupportListRow[]> }>();
function sharedSupportRows(orgId: OrgId, q: string | null, nowMs: number): Promise<SupportListRow[]> {
  const key = `${orgId}\u001f${q ?? ''}`;
  const hit = supportRowsShared.get(key);
  if (hit && nowMs - hit.at < SUPPORT_ROWS_SHARE_MS) return hit.rows;
  for (const [k, v] of supportRowsShared) if (nowMs - v.at >= SUPPORT_ROWS_SHARE_MS) supportRowsShared.delete(k);
  const rows = listSupportRows(orgId, { q, nowMs });
  supportRowsShared.set(key, { at: nowMs, rows });
  rows.catch(() => supportRowsShared.delete(key));
  return rows;
}

/** `GET /api/receiving-lines`' list read (`handleReceivingLinesGet`) for one query string, rows only. */
async function readReceivingLines(orgId: OrgId, staffId: number | null | undefined, listParams: URLSearchParams): Promise<ReceivingLineRow[]> {
  const query = parseReceivingLinesQuery(listParams);
  const page = await fetchReceivingLinesPage({
    query,
    orgId,
    viewerStaffId: Number(staffId),
    universalIncoming: false,
    ...resolveReceivingLinesReadFlags(query),
    countTotal: false,
  });
  return page.rows as unknown as ReceivingLineRow[];
}

export async function getNavFacets(
  caller: { orgId: OrgId; staffId?: number | null; permissions: ReadonlySet<string> },
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
  if (isSupportFacetContext(context)) {
    return { ok: true, body: await supportFacets(context, params, (q, nowMs) => deps.supportRows(caller.orgId, q, nowMs)) };
  }
  if (context === 'pickup') {
    return { ok: true, body: await pickupFacets(caller.orgId, params, deps.listLocalPickupLines) };
  }
  if (context === 'live-feed') {
    return { ok: true, body: await liveFeedFacets(params, (filters) => deps.liveFeedFacets(caller.orgId, filters)) };
  }
  if (context === 'label-intake.uploads') {
    return { ok: true, body: await labelIntakeFilesFacets(params, (query) => countPrintFiles(caller.orgId, query)) };
  }
  if (context === 'label-intake.orders') {
    return { ok: true, body: await labelIntakeOrdersFacets(params, (query) => countOrderPackets(caller.orgId, query)) };
  }
  const run: FacetSqlRunner = (sql, bind) => deps.run(caller.orgId, sql, bind);
  if (context === 'stations-live') return { ok: true, body: await stationLiveFacets(caller.orgId, params, run) };
  if (context === 'stock.all') return { ok: true, body: await inventoryStockFacets(caller.orgId, params, run) };
  if (context === 'inventory.racks') return { ok: true, body: await inventoryRackFacets(caller.orgId, params, run) };
  if (context === 'incoming.pipeline') {
    return { ok: true, body: await incomingPipelineFacets(params, () => getIncomingSummary(caller.orgId)) };
  }
  if (context === 'incoming.docked') {
    return { ok: true, body: await incomingDockedFacets(params, (listParams) => readReceivingLines(caller.orgId, caller.staffId, listParams)) };
  }
  if (context === 'incoming.unboxed' || context === 'receive') {
    return { ok: true, body: await unboxFacets(context, params, (listParams) => readReceivingLines(caller.orgId, caller.staffId, listParams)) };
  }
  if (context === 'purchasing') {
    // The sheet's own read (`GET /api/nav/purchases`); the same permission already held here.
    return {
      ok: true,
      body: await purchasingFacets(params, async (apiParams) => {
        const answer = await getNavPurchases({ orgId: caller.orgId, permissions: caller.permissions }, apiParams);
        return answer.ok ? answer.body : null;
      }),
    };
  }
  if (context === 'fulfilled') {
    // The sheet's own read (`GET /api/nav/fulfilled`); the same permission already held here.
    return {
      ok: true,
      body: await fulfilledFacets(
        params,
        async (apiParams) => {
          const answer = await getNavFulfilled({ orgId: caller.orgId, permissions: caller.permissions }, apiParams, navFulfilledDeps);
          return answer.ok ? answer.body : null;
        },
        caller.staffId ?? null,
      ),
    };
  }
  if (isRepairFacetContext(context)) return { ok: true, body: await repairFacets(context, caller.orgId, params, run) };
  if (context === 'imports.runs' || context === 'imports.rows') {
    return { ok: true, body: await importFacets(context, caller.orgId, params, run) };
  }
  return { ok: true, body: await outboundFacets(context, caller.orgId, params, run) };
}
