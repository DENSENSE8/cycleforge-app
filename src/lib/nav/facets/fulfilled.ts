/**
 * Fulfilled (`/fulfilled`; facet context `fulfilled`) sidebar facets:
 * Channel, Carrier and Scan source, counted by the sheet's own read
 * (`GET /api/nav/fulfilled`, `getNavFulfilled`) over the same URL the sheet
 * sends (`fulfilledApiParams`) — one query, never a second predicate. The
 * read counts each facet with every OTHER filter applied, so picking a
 * carrier never empties the carrier list. A picked value the window no
 * longer holds still shows (at 0), so it can be cleared where it was set.
 *
 * Packer is the page's staff row, status the body's chip row — neither is a
 * group here.
 */

import type { NavFacetsResponse, NavFulfilledFacets } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { FULFILLED_FIND_PARAM, fulfilledApiParams } from '@/lib/outbound/fulfilled-params';

type ParamReader = Pick<URLSearchParams, 'get'>;

/** The sheet's read for one API query — its total and facets, or null when it refused. */
export type FulfilledFacetReader = (apiParams: URLSearchParams) => Promise<{ total: number; facets: NavFulfilledFacets } | null>;

/** Which of the read's facet lists answers each declared group. */
const FACET_LIST: Readonly<Record<string, 'channels' | 'carriers' | 'scans'>> = {
  channel: 'channels',
  carrier: 'carriers',
  scan: 'scans',
};

/** `viewerStaffId` answers `mine=me` (Packed by me) as the sheet's own read does. */
export async function fulfilledFacets(params: ParamReader, read: FulfilledFacetReader, viewerStaffId: number | null = null): Promise<NavFacetsResponse> {
  const answer = await read(fulfilledApiParams(params, params.get(FULFILLED_FIND_PARAM) ?? '', viewerStaffId));
  const groups = NAV_FACET_GROUPS.fulfilled.map((group) => {
    const list = FACET_LIST[group.id];
    const options = (list && answer ? answer.facets[list] : []).map((option) => ({ ...option }));
    const selected = params.get(group.param)?.trim();
    if (selected && !options.some((option) => option.value.toLowerCase() === selected.toLowerCase())) {
      options.push({ value: selected, label: selected, count: 0 });
    }
    return { id: group.id, label: group.label, param: group.param, options };
  });
  return { context: 'fulfilled', total: answer?.total ?? 0, groups };
}
