/**
 * Purchasing (`/purchasing`, a Receiving mode; facet context `purchasing`)
 * sidebar facets: Source and Vendor, counted by the sheet's own read
 * (`GET /api/nav/purchases`, `getNavPurchases`) over the same URL the sheet
 * sends (`purchasesApiParams`) — one query, never a second predicate. The
 * read counts each facet with every OTHER filter applied, so picking a vendor
 * never empties the vendor list. A picked value the window no longer holds
 * still shows (at 0), so it can be cleared where it was set.
 *
 * Status is not a group here: the status chips (`?recon=`) are the sheet's
 * own row in the body, and they narrow client-side.
 */

import type { NavFacetsResponse, NavPurchasesFacets } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import { purchasesApiParams } from '@/lib/receiving/purchases-params';

type ParamReader = Pick<URLSearchParams, 'get'>;

/** The sheet's read for one API query — its total and facets, or null when it refused. */
export type PurchasesFacetReader = (apiParams: URLSearchParams) => Promise<{ total: number; facets: NavPurchasesFacets } | null>;

/** Which of the read's facet lists answers each declared group. */
const FACET_LIST: Readonly<Record<string, 'sources' | 'vendors'>> = {
  source: 'sources',
  vendor: 'vendors',
};

export async function purchasingFacets(params: ParamReader, read: PurchasesFacetReader): Promise<NavFacetsResponse> {
  const answer = await read(purchasesApiParams(params, params.get(INBOUND_FIND_PARAM) ?? ''));
  const groups = NAV_FACET_GROUPS.purchasing.map((group) => {
    const list = FACET_LIST[group.id];
    const options = (list && answer ? answer.facets[list] : [])
      .filter((option) => option.value.trim())
      .map((option) => ({ value: option.value, label: option.label.trim() || option.value, count: option.count }));
    const selected = params.get(group.param)?.trim();
    if (selected && !options.some((option) => option.value === selected)) {
      options.push({ value: selected, label: selected, count: 0 });
    }
    return { id: group.id, label: group.label, param: group.param, options };
  });
  return { context: 'purchasing', total: answer?.total ?? 0, groups };
}
