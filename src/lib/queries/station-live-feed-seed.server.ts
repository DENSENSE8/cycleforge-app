import 'server-only';

import { dehydrate, QueryClient } from '@tanstack/react-query';
import { stationLiveFeedQueryKey } from '@/lib/queries/station-live-feed';
import { bindPersonalStationFeed } from '@/lib/station-feed/personal';
import { parseStationFeedQuery, queryStationLiveFeed } from '@/lib/station-feed/query.server';
import { STATION_FEED_DEFAULT_LIMIT, type StationFeedFilters } from '@/lib/station-feed/types';
import type { OrgId } from '@/lib/tenancy/constants';

function filterParams(filters: StationFeedFilters): URLSearchParams {
  const params = new URLSearchParams({ limit: String(STATION_FEED_DEFAULT_LIMIT) });
  // Staff scope is applied by the seed, never by a URL staff param.
  if (filters.jobs.length > 0) params.set('job', filters.jobs.join(','));
  if (filters.outcomes.length > 0) params.set('outcome', filters.outcomes.join(','));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  return params;
}

export async function seedStationLiveFeed(orgId: OrgId, staffId: number, filters: StationFeedFilters) {
  const queryClient = new QueryClient();
  try {
    const response = await queryStationLiveFeed(
      orgId,
      bindPersonalStationFeed(parseStationFeedQuery(filterParams(filters)), staffId),
    );
    queryClient.setQueryData(stationLiveFeedQueryKey(filters), {
      pages: [response],
      pageParams: [null],
    });
  } catch (error) {
    console.error('seedStationLiveFeed failed; client will fetch', error);
  }
  return dehydrate(queryClient);
}
