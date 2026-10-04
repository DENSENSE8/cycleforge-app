/**
 * Live feed (`/operations/live-feed`) facet counts. A context is a direction
 * view: `live-feed.outbound` / `live-feed.inbound` (that direction's Board).
 * Its `total` is the Board's package count under the request's own feed
 * params — the visible lanes' counts summed (each package sits in one lane);
 * a lane the lens does not apply to counts 0. Channel options are the lanes'
 * channel tallies before the channel pick; Carrier options (outbound) the
 * carrier lanes' tallies before the carrier pick. All come from the feed's
 * own statement (`countLiveFeedStatuses` → `buildFeedCountsSql`), so a count
 * is by construction the Board's total for that pick.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { LIVE_FEED_FACET_PAGE, NAV_FACET_GROUPS, type LiveFeedFacetContext, type NavFacetContext } from '@/lib/nav/facets/contexts';
import { LIVE_FEED_DIRECTIONS, LIVE_FEED_PARAMS, readLiveFeedFilters } from '@/lib/live-feed/route';
import {
  LIVE_FEED_CHANNEL_LABEL,
  LIVE_FEED_CHANNELS,
  liveFeedCarrierLabel,
  liveFeedStatusInChannel,
  liveFeedStatusesOf,
  type LiveFeedDirection,
} from '@/lib/live-feed/statuses';
import type { countLiveFeedStatuses } from '@/lib/live-feed/load';
import type { OrgId } from '@/lib/tenancy/constants';

export type LiveFeedCountReader = typeof countLiveFeedStatuses;

const PREFIX = `${LIVE_FEED_FACET_PAGE}.`;

export function isLiveFeedFacetContext(context: NavFacetContext): context is LiveFeedFacetContext {
  return context.startsWith(PREFIX) && (LIVE_FEED_DIRECTIONS as readonly string[]).includes(context.slice(PREFIX.length));
}

/** Sum `key → count` tallies across lanes, largest first (ties by key). */
function sumTallies(lists: ReadonlyArray<ReadonlyArray<{ key: string; count: number }>>): Array<{ key: string; count: number }> {
  const sums = new Map<string, number>();
  for (const list of lists) for (const t of list) sums.set(t.key, (sums.get(t.key) ?? 0) + t.count);
  return [...sums].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function liveFeedFacets(
  context: LiveFeedFacetContext,
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  params: Pick<URLSearchParams, 'get'>,
  readCounts: LiveFeedCountReader,
): Promise<NavFacetsResponse> {
  const direction = context.slice(PREFIX.length) as LiveFeedDirection;
  // The context names the direction; every other param is the page's (never a lane: the Board counts them all).
  const filters = readLiveFeedFilters({
    get: (name) => (name === LIVE_FEED_PARAMS.dir ? direction : name === LIVE_FEED_PARAMS.status ? null : params.get(name)),
  });
  // Every lane answers, even outside the channel pick (count 0, its Channel tallies intact).
  const specs = liveFeedStatusesOf(direction);
  const counted = await readCounts(caller.orgId, filters, caller.permissions, specs.map((spec) => spec.id));
  // The total is the visible lanes'; Carrier sums the carrier lanes, Channel every lane.
  const visible = specs.filter((spec) => liveFeedStatusInChannel(spec, filters.channel));
  const total = visible.reduce((sum, spec) => sum + (counted[spec.id]?.count ?? 0), 0);
  const carriers = sumTallies(visible.filter((spec) => spec.carrier).map((spec) => counted[spec.id]?.carriers ?? []));
  const channelCount = new Map(sumTallies(specs.map((spec) => counted[spec.id]?.channels ?? [])).map((t) => [t.key, t.count]));

  const groups = NAV_FACET_GROUPS[context].map((group) => ({
    id: group.id,
    label: group.label,
    param: group.param,
    options:
      group.param === LIVE_FEED_PARAMS.channel
        ? LIVE_FEED_CHANNELS.map((channel) => ({
            value: channel,
            label: LIVE_FEED_CHANNEL_LABEL[channel],
            count: channelCount.get(channel) ?? 0,
          }))
        : carriers.map((carrier) => ({ value: carrier.key, label: liveFeedCarrierLabel(carrier.key), count: carrier.count })),
  }));
  return { context, total, groups };
}
