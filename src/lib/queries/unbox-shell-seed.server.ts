/** Shell-level hydration for the Unbox station — the ONE seed that has to sit above the app shell rather than inside the page. */
import 'server-only';
import type { DehydratedState } from '@tanstack/react-query';
import { seedUnboxStation } from '@/lib/queries/unbox-spine-seed.server';
import { seedReadyToPackStation } from '@/lib/queries/ready-to-pack-shell-seed.server';
import { shouldSeedReadyToPackQueue } from '@/lib/queries/unshipped-seed-gate';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';

/** Testing station — `/test`, plus the legacy `/tech` the proxy redirects from. */
const TESTING_SURFACE_ROUTES: ReadonlySet<string> = new Set(['/test', '/tech']);

/** The seed for the app shell, or `null` when this request is not the Unbox station. */
export async function maybeSeedUnboxShell(
  pathname: string,
): Promise<DehydratedState | null> {
  if (pathname !== UNBOX_SURFACE_ROUTE) return null;
  try {
    const seed = await seedUnboxStation();
    return seed.mruReceivingId == null ? null : seed.state;
  } catch (error) {
    console.error('maybeSeedUnboxShell failed; client will fetch', error);
    return null;
  }
}

/** The shell paint seed for whichever station this request is on, or `null`. */
export async function maybeSeedShell(
  pathname: string,
  search: string,
): Promise<DehydratedState | null> {
  // `/search` is deliberately unseeded.
  if (TESTING_SURFACE_ROUTES.has(pathname)) {
    const params = Object.fromEntries(new URLSearchParams(search));
    if (!shouldSeedReadyToPackQueue(params)) return null;
    try {
      return await seedReadyToPackStation();
    } catch (error) {
      console.error('maybeSeedShell(test) failed; client will fetch', error);
      return null;
    }
  }
  return maybeSeedUnboxShell(pathname);
}
