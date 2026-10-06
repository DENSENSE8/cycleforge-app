/**
 * `G` then a letter → one of the CURRENT lane's modes (the parent level).
 * Scoped per lane (owner 2026-09-27): a lane's letters never leak onto another
 * lane's pages, so two lanes may reuse a letter (Shipping and Sourcing are
 * both `S`). Keyed by letter inside each lane so two modes of one lane can
 * never claim the same one. A page's views keep bare `1`–`9` (child level);
 * modes get the "go somewhere" sequence (Linear, GitHub, Gmail). Off a lane
 * with modes, `G` does nothing — unless the page declares its own letters.
 */

import { getSidebarPageNav, spineSectionIdForPage, type SpineSectionId } from '@/lib/sidebar-navigation';

export const NAV_GO_KEYS: Readonly<Partial<Record<SpineSectionId, Readonly<Record<string, string>>>>> = {
  // Scan Stations mirrors the contextual parent switcher.
  floor: { l: 'stations-live', a: 'triage', u: 'receive', q: 'testing', p: 'ready-to-pack', k: 'packer', s: 'scan-out' },
  fulfillment: { s: 'outbound', f: 'fba', l: 'label-intake' },
  // Purchasing (owner 2026-10-05) takes U — P is Local Pickup's.
  inbound: { d: 'incoming', u: 'purchasing', p: 'pickup', r: 'repair', s: 'sourcing' },
  inventory: { s: 'stock', l: 'inventory', q: 'qc-labels' },
};

/**
 * Page-scoped letters: on that page only, `G` then a letter opens one of the
 * page's CHILDREN (a `SidebarChildPage` id) — the Exceptions hub's domains
 * (owner 2026-09-28). They sit beside the page's lane letters, never over one.
 */
export const NAV_PAGE_GO_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  exceptions: { f: 'fulfillment', i: 'inventory', r: 'receiving' },
  // Tasks (owner 2026-09-29): G A All tasks · G D Daily checklist · G P Long-term projects — the parents; bare 1–3 the views under each.
  // Not G C: C is create app-wide (owner 2026-09-30, `key-registry.ts`).
  home: { a: 'tasks', d: 'daily', p: 'projects' },
  // Print station (owner 2026-10-04): G F FNSKU labels (printing) · G S Stations (managing); bare 1–2 the FNSKU views.
  'print-station': { f: 'fnsku-labels', s: 'stations' },
};

/** One `G` destination: a page, or one of `pageId`'s children (`childId`). */
export type NavGoDestination = { letter: string; pageId: string; childId?: string };

/**
 * Every `G` destination on `pageId`: its lane's modes, then the page's own
 * child letters. A page letter that a lane letter already holds throws — two
 * destinations can never share one key.
 */
export function navGoDestinations(pageId: string | undefined): NavGoDestination[] {
  if (!pageId) return [];
  const laneId = spineSectionIdForPage(getSidebarPageNav(pageId));
  const lane = laneId ? (NAV_GO_KEYS[laneId] ?? {}) : {};
  const own = NAV_PAGE_GO_KEYS[pageId] ?? {};
  const destinations: NavGoDestination[] = Object.entries(lane).map(([letter, target]) => ({ letter, pageId: target }));
  for (const [letter, childId] of Object.entries(own)) {
    if (letter in lane) throw new Error(`G ${letter.toUpperCase()} on ${pageId}: the page's ${childId} collides with lane ${laneId}'s ${lane[letter]}`);
    destinations.push({ letter, pageId, childId });
  }
  return destinations;
}
