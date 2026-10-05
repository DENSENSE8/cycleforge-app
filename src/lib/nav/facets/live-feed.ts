/**
 * Live feed (`/operations/live-feed`) facet counts. The board's own loader
 * answers them (`loadLiveFeedFacets`, the same member set and filter SQL as
 * `loadLiveFeedBoard`), each group counted with every OTHER filter applied —
 * this module only reads the URL the board reads and reshapes the answer.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { readLiveFeedFilters, type LiveFeedFilters } from '@/lib/live-feed/route';
import type { LiveFeedFacetOption, LiveFeedFacets } from '@/lib/live-feed/types';

export type LiveFeedFacetReader = (filters: LiveFeedFilters) => Promise<LiveFeedFacets>;

/** Members the group's own filter keeps (all of them when unfiltered); a lower bound of the board total (keyless rows are not facet options). */
function kept(options: readonly LiveFeedFacetOption[], selected: readonly string[] | null): number {
  return options.reduce((sum, option) => (selected && !selected.includes(option.value) ? sum : sum + option.count), 0);
}

export async function liveFeedFacets(params: Pick<URLSearchParams, 'get'>, read: LiveFeedFacetReader): Promise<NavFacetsResponse> {
  const filters = readLiveFeedFilters(params);
  const facets = await read(filters);
  const [carrierDecl, channelDecl] = NAV_FACET_GROUPS['live-feed'];
  return {
    context: 'live-feed',
    // Exact whenever either facet is filtered; otherwise the larger keyed count.
    total: Math.max(kept(facets.carrier, filters.carriers), kept(facets.channel, filters.channels)),
    groups: [
      { id: carrierDecl!.id, label: carrierDecl!.label, param: carrierDecl!.param, options: facets.carrier.map(({ value, count }) => ({ value, label: value, count })) },
      { id: channelDecl!.id, label: channelDecl!.label, param: channelDecl!.param, options: facets.channel.map(({ value, label, count }) => ({ value, label: label || value, count })) },
    ],
  };
}
