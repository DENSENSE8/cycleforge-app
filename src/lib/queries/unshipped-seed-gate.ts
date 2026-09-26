/** When may a server seed of the Unshipped queue reach the grid that mounts? */

/** A page's `searchParams`, as Next hands them over. */
export type SeedGateSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function first(params: SeedGateSearchParams, key: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '').trim();
}

/** True when a bare `/test` request will mount the Ready-to-Pack **Pending** grid against the seeded key. */
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
