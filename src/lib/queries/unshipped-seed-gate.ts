/** When may a server seed of the Unshipped queue reach the grid that mounts? */

/** A page's `searchParams`, as Next hands them over. */
type SeedGateSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

function first(params: SeedGateSearchParams, key: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '').trim();
}

/** True when a `/pick` request will mount the Picker desk's **Pending** grid against the seeded key. */
export function shouldSeedReadyToPackQueue(params: SeedGateSearchParams): boolean {
  const ship = first(params, 'ship').toLowerCase();
  if (ship !== '' && ship !== 'pending' && ship !== 'urgent') return false;

  if (first(params, 'search') !== '') return false;
  if (first(params, 'staff') !== '') return false;

  const stage = first(params, 'stage').toLowerCase();
  if (stage !== '' && stage !== 'all') return false;

  return true;
}
