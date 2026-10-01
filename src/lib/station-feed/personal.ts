import type { StationFeedQuery } from './types';

/** Personal history ignores any client staff selection. */
export function bindPersonalStationFeed(query: StationFeedQuery, staffId: number): StationFeedQuery {
  if (!Number.isSafeInteger(staffId) || staffId <= 0) {
    throw new Error('authenticated staff is required');
  }
  return { ...query, staffIds: [staffId] };
}
