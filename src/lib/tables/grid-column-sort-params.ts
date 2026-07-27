/**
 * URL param names for a spreadsheet COLUMN sort.
 *
 * Deliberately NOT `?sort=` / `?dir=`: those are already taken on the station
 * routes by *server* ordering vocabularies — `useIncomingFilters` (`zoho_newest`,
 * …) on `/incoming` and `normalizeHistorySort` on History. Those choose the
 * API's ORDER BY; these record which column header the operator clicked. Two
 * different questions, so two different params — reusing `sort` would have
 * silently made a header click rewrite the server query with an invalid value.
 *
 * Lives in `lib/` (not beside the `'use client'` hook) so the param-scrubbing
 * modules that must clear them — `useReceivingMode`'s `MODE_SCOPED_PARAMS` and
 * `stripCrossSurfaceParams` — can import the names instead of re-typing the
 * string literals and drifting.
 */

export const GRID_COLUMN_SORT_PARAM = 'colsort';
export const GRID_COLUMN_DIR_PARAM = 'coldir';
