/**
 * Page search for the ⌘K palette.
 *
 * The palette was records-only — orders, serials, tracking, titles — so the one
 * thing a keyboard-first operator most wants from a command palette, "take me
 * to that page", was the one thing it could not do. `sidebar-navigation.ts`
 * already claimed top rows "stay in ⌘K" for exactly this; nothing implemented
 * it. This is that.
 *
 * PURE: takes the already permission-filtered nav items and a query, returns
 * ranked hits. No hook, no fetch, no React — the ranking is asserted in
 * nav-page-search.test.ts with no DOM.
 *
 * Permission filtering is the CALLER's job and must already have happened:
 * pass the output of `getSidebarNavItems({ permissions })` /
 * `useOrgNavItems(...)`, never `APP_SIDEBAR_NAV`. Ranking a page a user cannot
 * open turns the palette into a directory of everything they are missing.
 */

import type { SidebarNavItem } from '@/lib/sidebar-navigation';

export interface NavPageHit {
  id: string;
  label: string;
  href: string;
  icon: SidebarNavItem['icon'];
  /** Why it matched — the caller may show it, and the tests assert on it. */
  matchedOn: 'label' | 'keyword' | 'href';
}

/** Lowercased, collapsed whitespace. Both sides of every comparison go through this. */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rank, low = better.
 *
 * The ordering is the point: an exact label beats a prefix beats a substring,
 * and every label match beats every keyword match. Typing "media" must land on
 * Media Library rather than on some other page that happens to list "media" as
 * an alias.
 */
function scoreFor(query: string, item: SidebarNavItem): { score: number; matchedOn: NavPageHit['matchedOn'] } | null {
  const label = norm(item.label);
  if (label === query) return { score: 0, matchedOn: 'label' };
  if (label.startsWith(query)) return { score: 1, matchedOn: 'label' };
  // Word-boundary hit inside the label ("library" → "Media Library") ranks
  // above a mid-word one so "rate" does not beat "Rates" on "corporate".
  if (label.split(' ').some((word) => word.startsWith(query))) {
    return { score: 2, matchedOn: 'label' };
  }
  if (label.includes(query)) return { score: 3, matchedOn: 'label' };

  for (const keyword of item.keywords ?? []) {
    const k = norm(keyword);
    if (k === query) return { score: 4, matchedOn: 'keyword' };
    if (k.startsWith(query)) return { score: 5, matchedOn: 'keyword' };
    if (k.includes(query)) return { score: 6, matchedOn: 'keyword' };
  }

  // The path is the last resort — it matches things the operator never sees
  // written down, so it must never outrank a visible label.
  if (norm(item.href).includes(query)) return { score: 7, matchedOn: 'href' };
  return null;
}

export const NAV_PAGE_SEARCH_LIMIT = 5;

/**
 * Rank `items` against `query`.
 *
 * Returns [] for a blank or single-character query: one letter matches most of
 * the map, which would bury the record hits the palette is mainly for behind a
 * wall of pages.
 */
export function searchNavPages(
  items: readonly SidebarNavItem[],
  query: string,
  limit = NAV_PAGE_SEARCH_LIMIT,
): NavPageHit[] {
  const q = norm(query);
  if (q.length < 2) return [];

  const scored: Array<{ hit: NavPageHit; score: number; order: number }> = [];
  items.forEach((item, order) => {
    const match = scoreFor(q, item);
    if (!match) return;
    scored.push({
      hit: {
        id: item.id,
        label: item.label,
        href: item.href,
        icon: item.icon,
        matchedOn: match.matchedOn,
      },
      score: match.score,
      order,
    });
  });

  // Registry order breaks ties, so the result is stable rather than dependent
  // on sort implementation — the same query always offers the same first row,
  // which is what makes "⌘K, type, Enter" muscle memory safe.
  scored.sort((a, b) => (a.score === b.score ? a.order - b.order : a.score - b.score));
  return scored.slice(0, limit).map((s) => s.hit);
}
