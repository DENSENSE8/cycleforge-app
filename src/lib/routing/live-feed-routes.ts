/** Param ownership for `/operations/live-feed` — the Live feed. */

import { z } from 'zod';
import { LIVE_FEED_PARAMS, LIVE_FEED_PATH } from '@/lib/live-feed/route';
import { defineRouteParams, paramPositiveInt, paramText, type ParamSchema, type RouteParamsSpec } from './route-params';

/** A card id: an order row (positive) or an unlinked box / scan (negative, `src/lib/live-feed/subjects.ts`). */
const paramCardId: ParamSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().regex(/^-?[1-9]\d*$/));

/**
 * The open package (`open`, its card id — negative for an unlinked box or
 * scan), the sidebar's find (`q`), its carrier / channel / documents-owed /
 * flag facets (comma-separated keys), staff filter (`staff`, a staff id) and
 * the per-column order (`sort`). The board is always today, so it owns no
 * window param. `stage`, `offset` and `ids` are the APIs' own query, never page params.
 */
export const LIVE_FEED_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  defineRouteParams({
    route: LIVE_FEED_PATH,
    owns: {
      [LIVE_FEED_PARAMS.open]: paramCardId,
      [LIVE_FEED_PARAMS.q]: paramText,
      [LIVE_FEED_PARAMS.carrier]: paramText,
      [LIVE_FEED_PARAMS.channel]: paramText,
      [LIVE_FEED_PARAMS.docs]: paramText,
      [LIVE_FEED_PARAMS.flag]: paramText,
      [LIVE_FEED_PARAMS.staff]: paramPositiveInt,
      [LIVE_FEED_PARAMS.sort]: paramText,
    },
  }),
];
