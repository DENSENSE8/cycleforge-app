/** Parse the prepack query contract (`prepackHref` in the route tree writes it). */

import type { PrepackRouteState } from '@/lib/nav/route-tree';

type QuerySource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: QuerySource, key: string): string {
  if (source instanceof URLSearchParams) return source.get(key)?.trim() ?? '';
  const value = source[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export function parsePrepackRouteState(source: QuerySource): PrepackRouteState {
  const catalogId = Number(read(source, 'catalogId'));
  return {
    unit: read(source, 'unit') || null,
    catalogId: Number.isInteger(catalogId) && catalogId > 0 ? catalogId : null,
    serialRequestId: read(source, 'serialRequestId') || null,
  };
}
