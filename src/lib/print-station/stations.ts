/**
 * Print station › **Stations** (owner 2026-10-04) — the managing mode: every
 * org print station, its printers and online state, and which one prints each
 * stock by default. `G S` from anywhere on the Print station; `G F` goes back
 * to printing (FNSKU labels). Browser- and server-safe.
 */

import { PRINT_STATION_PATHS } from '@/lib/nav/route-tree';

export const PRINT_STATIONS_PATH = PRINT_STATION_PATHS.stations;

/** `?station=` — the open station (its registry id, `ps_<uuid>`). */
export const PRINT_STATIONS_STATION_PARAM = 'station' as const;

/** A station id as the registry accepts it (`ps_<uuid>` today; ≤ 100 chars, no spaces). Anything else is not a station. */
export const PRINT_STATION_ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;
