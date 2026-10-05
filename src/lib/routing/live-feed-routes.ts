/** Param ownership for `/operations/live-feed` — the Live feed. */

import { LIVE_FEED_PARAMS, LIVE_FEED_PATH } from '@/lib/live-feed/route';
import { defineRouteParams, paramPositiveInt, paramText, type RouteParamsSpec } from './route-params';

/**
 * The open package (`open`, its order row id), the sidebar's find (`q`), its
 * carrier / channel facets (comma-separated keys) and staff filter (`staff`,
 * a staff id). The board is always today, so it owns no window param.
 * `stage`, `offset` and `ids` are the APIs' own query, never page params.
 */
export const LIVE_FEED_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  defineRouteParams({
    route: LIVE_FEED_PATH,
    owns: {
      [LIVE_FEED_PARAMS.open]: paramPositiveInt,
      [LIVE_FEED_PARAMS.q]: paramText,
      [LIVE_FEED_PARAMS.carrier]: paramText,
      [LIVE_FEED_PARAMS.channel]: paramText,
      [LIVE_FEED_PARAMS.staff]: paramPositiveInt,
    },
  }),
];
