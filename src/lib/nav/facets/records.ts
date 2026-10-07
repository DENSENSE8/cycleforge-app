/**
 * Records (`/records`; facet context `records`) sidebar facets: every
 * `RECORDS_FACETS` group, counted by the sheet's own read
 * (`GET /api/nav/records`, `getNavRecords`) over the same query the sheet
 * sends (`recordsApiParams`) — one statement, never a second predicate. The
 * read counts each facet with every OTHER facet's filter applied (its own
 * include and exclude lifted), so picking a platform never empties the
 * platform list. A picked or excluded value the read no longer holds still
 * shows (at 0), so it can be cleared where it was set.
 */

import type { NavFacetsResponse, NavRecordsFacets } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { RECORDS_FACETS, recordsApiParams } from '@/lib/nav/records/params';

type ParamReader = Pick<URLSearchParams, 'get'>;

/** The sheet's read for one API query — its total and facets, or null when it refused. */
export type RecordsFacetReader = (apiParams: URLSearchParams) => Promise<{ total: number; facets: NavRecordsFacets } | null>;

export async function recordsFacets(params: ParamReader, read: RecordsFacetReader): Promise<NavFacetsResponse> {
  const answer = await read(recordsApiParams(params));
  const groups = NAV_FACET_GROUPS.records.map((group) => {
    const facet = RECORDS_FACETS.find((candidate) => candidate.id === group.id)!;
    const options = (answer ? answer.facets[facet.id] : []).map((option) => ({ ...option }));
    for (const param of [facet.param, facet.excludeParam]) {
      for (const selected of String(params.get(param) ?? '').split(',')) {
        const value = selected.trim();
        if (value && !options.some((option) => option.value.toLowerCase() === value.toLowerCase())) {
          options.push({ value, label: value, count: 0 });
        }
      }
    }
    return { id: group.id, label: group.label, param: group.param, options };
  });
  return { context: 'records', total: answer?.total ?? 0, groups };
}
