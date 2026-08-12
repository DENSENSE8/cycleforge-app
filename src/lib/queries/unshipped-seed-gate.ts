/**
 * When may a server seed of the Unshipped queue reach the grid that mounts?
 *
 * `seedUnshippedQueue` warms exactly ONE cache key — the default
 * `UnshippedTable` mount (`strictSearchScope`, empty search, no stage, no staff
 * filter, `limit: 200`). Every other combination of URL facets builds a
 * DIFFERENT key, so seeding those requests buys nothing and still charges the
 * seed's two round trips to TTFB.
 *
 * This is the gate for surfaces that reach the queue through a tab rather than
 * owning the whole page (Testing → Ready to Pack). `/shipping/orders` seeds
 * unconditionally because the queue IS that route.
 *
 * Pure + client-safe on purpose: the seed module carries `server-only`, and a
 * predicate that cannot be unit-tested is a predicate nobody checks.
 */

/** A page's `searchParams`, as Next hands them over. */
export type SeedGateSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function first(params: SeedGateSearchParams, key: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '').trim();
}

/**
 * True when a bare `/test` request will mount the Ready-to-Pack **Pending**
 * grid against the seeded key.
 *
 * - `?view=testing` (or the legacy `testing-history`) is Quality Control — a
 *   different centre entirely.
 * - `?ship=all|history` swap the table for `TechAllTriageTable` / `TechTable`.
 *   `urgent` is kept: `?attention=1` filters client-side, so its query key is
 *   the seeded one.
 * - `search` / `stage` / `staff` each change the key
 *   (`unshippedOrdersQuery`), so a seed would sit unread for its whole
 *   `staleTime` while the client fetched the real one.
 */
export function shouldSeedReadyToPackQueue(params: SeedGateSearchParams): boolean {
  const view = first(params, 'view').toLowerCase();
  if (view === 'testing' || view === 'testing-history') return false;

  const ship = first(params, 'ship').toLowerCase();
  if (ship !== '' && ship !== 'pending' && ship !== 'urgent') return false;

  if (first(params, 'search') !== '') return false;
  if (first(params, 'staff') !== '') return false;

  const stage = first(params, 'stage').toLowerCase();
  if (stage !== '' && stage !== 'all') return false;

  return true;
}
