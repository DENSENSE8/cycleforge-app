/** Client refine + display sort for `/search` over the retrieved top-50. */

import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import { isUiEntityType } from '@/lib/search/search-hit';
import { GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';

export const SEARCH_ETYPE_PARAM = 'etype';
export const SEARCH_HSTAT_PARAM = 'hstat';
/** Client channel refine over the retrieved top-50 — the stored `source_platform` value (`ebay`, `amazon`, `ecwid`, …), NOT a display… */
export const SEARCH_CHAN_PARAM = 'chan';
export const SEARCH_SORT_PARAM = GRID_COLUMN_SORT_PARAM;

export const SEARCH_ENTITY_TYPES = [
  'order',
  'unit',
  'receiving',
  'sku',
  'repair',
  'fba',
  'warranty',
  'ticket',
  'location',
] as const satisfies readonly SearchHitEntityType[];

export const SEARCH_ENTITY_TYPE_LABELS: Record<SearchHitEntityType, string> = {
  order: 'Orders',
  unit: 'Units',
  receiving: 'Receiving',
  sku: 'SKUs',
  repair: 'Repairs',
  fba: 'FBA',
  warranty: 'Warranty',
  ticket: 'Tickets',
  location: 'Bins',
};

export type SearchDisplaySort = 'relevance' | 'date';

export const SEARCH_DISPLAY_SORT_OPTIONS = [
  { id: 'relevance' as const, label: 'Relevance', shortLabel: 'Relevance' },
  { id: 'date' as const, label: 'Date', shortLabel: 'Date' },
] as const;

export function parseSearchEtype(raw: string | null | undefined): SearchHitEntityType | null {
  const v = String(raw ?? '').trim().toLowerCase();
  return isUiEntityType(v) ? v : null;
}

/**
 * Wire tokens `?etype=` may carry (route-param hygiene). Round-trip this — not a
 * hand-copied enum twin of {@link SEARCH_ENTITY_TYPES}.
 */
export function parseSearchEtypeWire(raw: string): string | null {
  return parseSearchEtype(raw);
}

export function parseSearchHstat(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim();
  return v ? v : null;
}

export function parseSearchChan(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toLowerCase();
  return v ? v : null;
}

export function parseSearchDisplaySort(raw: string | null | undefined): SearchDisplaySort {
  return String(raw ?? '').trim().toLowerCase() === 'date' ? 'date' : 'relevance';
}

/** Unique non-empty `facets.status` values in the current hit set (stable order). */
export function statusOptionsFromHits(hits: ReadonlyArray<AiSearchHit>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    const status = hit.facets?.status?.trim();
    if (!status || seen.has(status)) continue;
    seen.add(status);
    out.push(status);
  }
  return out;
}

/** Unique non-empty `facets.source_platform` values in the hit set (stable order). */
export function channelOptionsFromHits(hits: ReadonlyArray<AiSearchHit>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    const channel = hit.facets?.source_platform?.trim().toLowerCase();
    if (!channel || seen.has(channel)) continue;
    seen.add(channel);
    out.push(channel);
  }
  return out;
}

export function refineSearchHits(
  hits: ReadonlyArray<AiSearchHit>,
  opts: {
    etype?: SearchHitEntityType | null;
    hstat?: string | null;
    chan?: string | null;
  },
): AiSearchHit[] {
  const etype = opts.etype ?? null;
  const hstat = opts.hstat?.trim() || null;
  const chan = opts.chan?.trim().toLowerCase() || null;
  if (!etype && !hstat && !chan) return [...hits];
  return hits.filter((hit) => {
    if (etype && hit.entityType !== etype) return false;
    if (hstat) {
      const status = hit.facets?.status?.trim() ?? '';
      if (status !== hstat) return false;
    }
    if (chan) {
      const channel = hit.facets?.source_platform?.trim().toLowerCase() ?? '';
      if (channel !== chan) return false;
    }
    return true;
  });
}

/** Per-entity hit tallies for the browse toolbar's scope cluster. */
export interface SearchEntityCounts {
  /** Hits matching the non-entity facets — the "All" pill's count. */
  total: number;
  byType: Record<SearchHitEntityType, number>;
}

export function searchEntityCounts(
  hits: ReadonlyArray<AiSearchHit>,
  opts: { hstat?: string | null; chan?: string | null } = {},
): SearchEntityCounts {
  const byType = Object.fromEntries(
    SEARCH_ENTITY_TYPES.map((type) => [type, 0]),
  ) as Record<SearchHitEntityType, number>;
  const scoped = refineSearchHits(hits, {
    etype: null,
    hstat: opts.hstat ?? null,
    chan: opts.chan ?? null,
  });
  for (const hit of scoped) {
    // Retrieval can carry a wire type the UI has no scope pill for
    // (`import_exception`) — it counts toward `total`, never a typed bucket.
    if (isUiEntityType(hit.entityType)) byType[hit.entityType] += 1;
  }
  return { total: scoped.length, byType };
}

/**
 * Relevance keeps RRF/exact order. Date sorts by `facets.happened_at` desc,
 * nulls last — then stable by original index so equal timestamps don't shuffle.
 */
export function sortSearchHits(
  hits: ReadonlyArray<AiSearchHit>,
  sort: SearchDisplaySort,
): AiSearchHit[] {
  if (sort === 'relevance') return [...hits];
  return hits
    .map((hit, index) => ({ hit, index, t: happenedAtMs(hit) }))
    .sort((a, b) => {
      if (a.t == null && b.t == null) return a.index - b.index;
      if (a.t == null) return 1;
      if (b.t == null) return -1;
      if (b.t !== a.t) return b.t - a.t;
      return a.index - b.index;
    })
    .map((row) => row.hit);
}

function happenedAtMs(hit: AiSearchHit): number | null {
  const raw = hit.facets?.happened_at?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Apply `?etype=` / `?hstat=` / `?colsort=` mutators onto a URLSearchParams. */
export function applySearchEtype(params: URLSearchParams, next: SearchHitEntityType | null): void {
  if (next) params.set(SEARCH_ETYPE_PARAM, next);
  else params.delete(SEARCH_ETYPE_PARAM);
}

export function applySearchHstat(params: URLSearchParams, next: string | null): void {
  const v = next?.trim() || null;
  if (v) params.set(SEARCH_HSTAT_PARAM, v);
  else params.delete(SEARCH_HSTAT_PARAM);
}

export function applySearchChan(params: URLSearchParams, next: string | null): void {
  const v = next?.trim().toLowerCase() || null;
  if (v) params.set(SEARCH_CHAN_PARAM, v);
  else params.delete(SEARCH_CHAN_PARAM);
}

export function applySearchDisplaySort(params: URLSearchParams, next: SearchDisplaySort): void {
  if (next === 'relevance') params.delete(SEARCH_SORT_PARAM);
  else params.set(SEARCH_SORT_PARAM, next);
}

export function clearSearchRefine(params: URLSearchParams): void {
  params.delete(SEARCH_ETYPE_PARAM);
  params.delete(SEARCH_HSTAT_PARAM);
  params.delete(SEARCH_CHAN_PARAM);
}

/** How many refines are LIVE — the number a collapsed phone trigger prints. */
export function activeSearchRefineCount(params: URLSearchParams): number {
  let count = 0;
  if (parseSearchEtype(params.get(SEARCH_ETYPE_PARAM))) count += 1;
  if (parseSearchHstat(params.get(SEARCH_HSTAT_PARAM))) count += 1;
  if (parseSearchChan(params.get(SEARCH_CHAN_PARAM))) count += 1;
  return count;
}
