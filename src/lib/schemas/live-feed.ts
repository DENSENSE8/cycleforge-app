import { z } from 'zod';
import {
  LIVE_FEED_CARRIER_MAX,
  LIVE_FEED_DIRECTIONS,
  LIVE_FEED_PARAMS,
  LIVE_FEED_QUERY_MAX,
  LIVE_FEED_TIME_RE,
} from '@/lib/live-feed/route';
import { LIVE_FEED_CHANNELS, LIVE_FEED_LENSES, LIVE_FEED_STATUS_IDS } from '@/lib/live-feed/statuses';
import { parseDateKey } from '@/utils/date';

const dateKey = z.string().trim().refine((v) => parseDateKey(v) != null, 'Expected YYYY-MM-DD');
const timeKey = z.string().trim().regex(LIVE_FEED_TIME_RE, 'Expected HH:mm');

/**
 * `GET /api/live-feed`, `/api/live-feed/board` and `/api/live-feed/tracking`
 * query — the `/operations/live-feed` page's URL filters. The lane page and
 * the tracking read require a `status` (the routes refuse a lane the
 * direction / channel do not hold); the Board ignores `status` and `page`.
 * `from`/`to` are optional on the wire only: the range always applies and
 * defaults to the warehouse's today. A `lens` the direction does not offer
 * reads as `entered`.
 */
export const LiveFeedQuery = z
  .object({
    [LIVE_FEED_PARAMS.dir]: z.enum(LIVE_FEED_DIRECTIONS).optional(),
    [LIVE_FEED_PARAMS.status]: z.enum(LIVE_FEED_STATUS_IDS).optional(),
    [LIVE_FEED_PARAMS.channel]: z.enum(LIVE_FEED_CHANNELS).optional(),
    [LIVE_FEED_PARAMS.staff]: z.coerce.number().int().positive().optional(),
    [LIVE_FEED_PARAMS.lens]: z.enum(LIVE_FEED_LENSES).optional(),
    [LIVE_FEED_PARAMS.from]: dateKey.optional(),
    [LIVE_FEED_PARAMS.to]: dateKey.optional(),
    [LIVE_FEED_PARAMS.timeFrom]: timeKey.optional(),
    [LIVE_FEED_PARAMS.timeTo]: timeKey.optional(),
    [LIVE_FEED_PARAMS.carrier]: z.string().trim().min(1).max(LIVE_FEED_CARRIER_MAX).optional(),
    [LIVE_FEED_PARAMS.q]: z.string().trim().min(1).max(LIVE_FEED_QUERY_MAX).optional(),
    [LIVE_FEED_PARAMS.carry]: z.enum(['1', 'true']).optional(),
    [LIVE_FEED_PARAMS.page]: z.coerce.number().int().positive().optional(),
  })
  .strict();
