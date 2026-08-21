/**
 * `/search` recent-rail view model — pure, unit-testable, no React.
 *
 * A recent is a QUERY that may have resolved to a RECORD. Rows that carry a
 * `topHit` whose href names a `?sel=` selection open that record in the station
 * preview (the Unbox-rail gesture: click a row, the middle becomes it). Rows
 * without one re-run the query instead.
 */

import { parseSearchSel, type SearchSelection } from '@/lib/search/search-selection';
import type { SearchRecentEntry } from '@/lib/search/search-recents';

/** Numeric surrogate for the rail's `getId` — DB recents are bigint-keyed. */
export function searchRecentRowId(entry: SearchRecentEntry): number {
  const n = Number(entry.id);
  if (Number.isFinite(n) && n > 0) return n;
  // localStorage entries are uuids; fold to a stable positive int so the rail
  // can still key + highlight them. Collisions only cost a highlight, never a
  // wrong navigation (selection re-derives from the URL, not from this id).
  let h = 0;
  for (let i = 0; i < entry.id.length; i += 1) {
    h = (h * 31 + entry.id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/**
 * The `?sel=` a recent opens, or null when it only re-runs a query.
 * Parsed from `topHit.href` / `scopeHref` — never reconstructed from the title.
 */
export function searchRecentSelection(entry: SearchRecentEntry): SearchSelection | null {
  const href = entry.topHit?.href?.trim() || entry.scopeHref?.trim() || '';
  if (!href) return null;
  const queryStart = href.indexOf('?');
  if (queryStart < 0) return null;
  const params = new URLSearchParams(href.slice(queryStart + 1));
  return parseSearchSel(params.get('sel'));
}

/** Title line: the record when the recent resolved to one, else the query. */
export function searchRecentTitle(entry: SearchRecentEntry): string {
  const hit = entry.topHit?.title?.trim();
  if (hit) return hit;
  return entry.query.trim() || 'Untitled search';
}

/** Secondary line — the typed query when the title is already the record. */
export function searchRecentMeta(entry: SearchRecentEntry): string | null {
  const hit = entry.topHit?.title?.trim();
  const query = entry.query.trim();
  if (hit && query && hit !== query) return query;
  return entry.scopeLabel?.trim() || null;
}

/**
 * Draft filter over the recents list — the rail's find bar narrows what is
 * already there while the same draft waits to be committed as a query.
 * Matches the record title AND the typed query, because an operator hunting a
 * unit remembers the serial they typed at least as often as the product name.
 */
export function searchRecentMatchesFilter(
  entry: SearchRecentEntry,
  filter: string,
): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    entry.query,
    entry.topHit?.title,
    entry.topHit?.entityType,
    entry.scopeLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

export function searchRecentStatusDot(entry: SearchRecentEntry): string {
  // Resolved to a record = a hit worth returning to; a bare query is quieter.
  return searchRecentSelection(entry) ? 'bg-emerald-500' : 'bg-text-faint';
}

export function searchRecentStatusDotLabel(entry: SearchRecentEntry): string {
  return searchRecentSelection(entry) ? 'Opened a record' : 'Query only';
}

/**
 * Which rail row is "current". A `?sel=` match wins (the record is on screen);
 * otherwise the row whose query is the active `?q=`.
 */
export function resolveSearchRecentSelectedId(
  rows: SearchRecentEntry[],
  sel: SearchSelection | null,
  q: string,
): number | null {
  if (sel) {
    const bySel = rows.find((row) => {
      const rowSel = searchRecentSelection(row);
      return rowSel?.entityType === sel.entityType && rowSel.id === sel.id;
    });
    if (bySel) return searchRecentRowId(bySel);
  }
  const normalized = q.trim().toLowerCase();
  if (!normalized) return null;
  const byQuery = rows.find((row) => row.query.trim().toLowerCase() === normalized);
  return byQuery ? searchRecentRowId(byQuery) : null;
}
