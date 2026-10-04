/** Param ownership for `/operations/live-feed` — the Live feed. */

import { LIVE_FEED_DIRECTIONS, LIVE_FEED_PARAMS, LIVE_FEED_PATH } from '@/lib/live-feed/route';
import { LIVE_FEED_CHANNELS, LIVE_FEED_LENSES } from '@/lib/live-feed/statuses';
import {
  defineRouteParams,
  paramDateKey,
  paramEnum,
  paramFlag,
  paramText,
  paramTimeKey,
  type RouteParamsSpec,
} from './route-params';

/**
 * The direction view (`dir`), the Channel facet (`channel`), Date by
 * (`lens`), the header's range (`from`/`to` + `timeFrom`/`timeTo`, page
 * chrome), the Carrier facet (`carrier`), Find (`q`) and the carried-over
 * toggle (`carry`). `staff` is the ambient staff filter. `status` and `page`
 * are the lane API's own query, never page params.
 */
export const LIVE_FEED_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  defineRouteParams({
    route: LIVE_FEED_PATH,
    owns: {
      [LIVE_FEED_PARAMS.dir]: paramEnum(LIVE_FEED_DIRECTIONS),
      [LIVE_FEED_PARAMS.channel]: paramEnum(LIVE_FEED_CHANNELS),
      [LIVE_FEED_PARAMS.lens]: paramEnum(LIVE_FEED_LENSES),
      [LIVE_FEED_PARAMS.from]: paramDateKey,
      [LIVE_FEED_PARAMS.to]: paramDateKey,
      [LIVE_FEED_PARAMS.timeFrom]: paramTimeKey,
      [LIVE_FEED_PARAMS.timeTo]: paramTimeKey,
      [LIVE_FEED_PARAMS.carrier]: paramText,
      [LIVE_FEED_PARAMS.q]: paramText,
      [LIVE_FEED_PARAMS.carry]: paramFlag,
    },
    carries: [LIVE_FEED_PARAMS.staff],
  }),
];
