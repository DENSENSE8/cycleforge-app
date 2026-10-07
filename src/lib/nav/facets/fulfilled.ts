/**
 * Fulfilled (`/fulfilled`; facet contexts `fulfilled.<view>`) sidebar facets:
 * Journey, Platform, Carrier and Scan source, counted by the sheet's own read
 * (`GET /api/nav/fulfilled`, `getNavFulfilled`) over the same URL the sheet
 * sends (`fulfilledApiParams`) — one query, never a second predicate. The
 * read counts each facet with every OTHER filter applied, so picking a
 * carrier never empties the carrier list; Journey is the read's own bucket
 * counts (orders). A picked value the window no longer holds still shows (at
 * 0), so it can be cleared where it was set.
 *
 * A view's count is the read's own bucket count: the board's is every order
 * on its columns (`FULFILLED_BOARD_BUCKET_IDS`), a view's its one bucket. The
 * facets themselves are the window's, alike on every view.
 *
 * Packer is the page's staff row — not a group here.
 */

import type { NavFacetsResponse, NavFulfilledFacets, NavLocateBucket } from '@/lib/nav/context/schema';
import { FULFILLED_FACET_CONTEXTS, FULFILLED_GROUPS, type FulfilledFacetContextId } from '@/lib/nav/facets/contexts';
import { FULFILLED_BOARD_BUCKET_IDS } from '@/lib/nav/locate/bucket-precedence';
import { FULFILLED_FIND_PARAM, fulfilledApiParams } from '@/lib/outbound/fulfilled-params';

type ParamReader = Pick<URLSearchParams, 'get'>;

/** What the sheet's read answers the facets with: its bucket counts and facet lists. */
export interface FulfilledFacetRead {
  buckets: readonly NavLocateBucket[];
  facets: NavFulfilledFacets;
}

/** The sheet's read for one API query, or null when it refused. */
export type FulfilledFacetReader = (apiParams: URLSearchParams) => Promise<FulfilledFacetRead | null>;

/** Which of the read's facet lists answers each declared group; Journey reads the bucket counts. */
const FACET_LIST: Readonly<Record<string, 'platforms' | 'carriers' | 'scans'>> = {
  platform: 'platforms',
  carrier: 'carriers',
  scan: 'scans',
};

export function isFulfilledFacetContext(context: string): context is FulfilledFacetContextId {
  return (FULFILLED_FACET_CONTEXTS as readonly string[]).includes(context);
}

/** `viewerStaffId` answers `mine=me` (Packed by me) as the sheet's own read does. */
export async function fulfilledFacets(
  context: FulfilledFacetContextId,
  params: ParamReader,
  read: FulfilledFacetReader,
  viewerStaffId: number | null = null,
): Promise<NavFacetsResponse> {
  const answer = await read(fulfilledApiParams(params, params.get(FULFILLED_FIND_PARAM) ?? '', viewerStaffId));
  const groups = FULFILLED_GROUPS.map((group) => {
    const list = FACET_LIST[group.id];
    const options = !answer
      ? []
      : group.id === 'journey'
        ? answer.buckets.filter((bucket) => bucket.count > 0).map((bucket) => ({ value: bucket.id, label: bucket.label, count: bucket.count }))
        : list
          ? answer.facets[list].map((option) => ({ ...option }))
          : [];
    const selected = params.get(group.param)?.trim();
    if (selected && !options.some((option) => option.value.toLowerCase() === selected.toLowerCase())) {
      options.push({ value: selected, label: selected, count: 0 });
    }
    return { id: group.id, label: group.label, param: group.param, options };
  });
  const view = context.slice('fulfilled.'.length);
  const counted: readonly string[] = view === 'board' ? FULFILLED_BOARD_BUCKET_IDS : [view];
  const total = (answer?.buckets ?? []).reduce((sum, bucket) => sum + (counted.includes(bucket.id) ? bucket.count : 0), 0);
  return { context, total, groups };
}
