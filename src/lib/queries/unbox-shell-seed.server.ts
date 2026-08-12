/**
 * Shell-level hydration for the Unbox station — the ONE seed that has to sit
 * above the app shell rather than inside the page.
 *
 * ## Why this cannot live in `/unbox/page.tsx`
 *
 * The recents rail is not part of the page. `ResponsiveLayout` renders
 * `<ContextPanelLayout>{children}</ContextPanelLayout>`, so the rail is a
 * SIBLING of the page and React renders it **first** — before the page's
 * `HydrationBoundary` has put anything in the QueryClient. A seed inside the
 * page therefore cannot reach the rail on the server: the rail server-renders
 * empty and fills in only after the client fetch resolves.
 *
 * That is not a theoretical ordering nit, it was the whole LCP: the largest
 * contentful element on `/unbox` is a **rail row's product title**, and it was
 * painting at ~5.9s behind a 153KB `view=unbox_opened` fetch, while the page's
 * seed of the same data sat unused in the RSC payload.
 *
 * Hydrating above `ResponsiveLayout` is the fix, and it is the reason this
 * module is gated on the pathname instead of just being called: the root layout
 * renders on every request, and only `/unbox` may pay for it.
 *
 * ## Scope discipline
 *
 * This is a **paint** seed, not a data source. It warms exactly two keys — the
 * selected rail row and that carton's lines — both of which the client already
 * owns and refetches. Every failure path returns `null` and the client fetches
 * exactly as it did before, so a seed problem degrades to the old behaviour
 * rather than an error page.
 *
 * Do not grow this into "seed whatever the shell might want": a key added here
 * is paid for by first paint on every cold `/unbox` load.
 */
import 'server-only';
import type { DehydratedState } from '@tanstack/react-query';
import { seedUnboxStation } from '@/lib/queries/unbox-spine-seed.server';
import { seedReadyToPackStation } from '@/lib/queries/ready-to-pack-shell-seed.server';
import { shouldSeedReadyToPackQueue } from '@/lib/queries/unshipped-seed-gate';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';

/** Testing station — `/test`, plus the legacy `/tech` the proxy redirects from. */
const TESTING_SURFACE_ROUTES: ReadonlySet<string> = new Set(['/test', '/tech']);

/**
 * The seed for the app shell, or `null` when this request is not the Unbox
 * station.
 *
 * `x-pathname` (set by `src/proxy.ts`) carries the path WITHOUT the query, so
 * this cannot tell bare `/unbox` from `?unboxdesk=1`. That is deliberate rather
 * than a gap: the rail is mounted on both, the selected row is the same row on
 * both, and the ranking read is 0.32ms — cheaper than plumbing the search string
 * through the proxy to skip it.
 */
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

/**
 * The shell paint seed for whichever station this request is on, or `null`.
 *
 * ONE dispatcher rather than a seed module per route wired into the layout:
 * these all answer the same question — *what must be in the first HTML that the
 * page's own `HydrationBoundary` is too late to supply* — and the root layout
 * should not grow a branch per station.
 *
 * A station belongs here only because its first-paint content is mounted by the
 * SHELL (a rail that is a sibling of `children`, and therefore renders first):
 *
 * - `/unbox` — the recents rail owns the largest contentful element.
 * - `/test` — the left rail's `ShippingScanBand` mounts `packPlacementQuery`
 *   before the page renders, so a page-level seed of that key lands in
 *   `HydrationBoundary`'s deferred path and never reaches SSR. (Measured: the
 *   KPI band still server-rendered its skeleton and swapped at hydration.)
 *
 * `search` is the raw query string (`x-search`, set by the proxy), which the
 * Testing gate needs because its tabs live in the URL and only the default one
 * reads the seed.
 */
export async function maybeSeedShell(
  pathname: string,
  search: string,
): Promise<DehydratedState | null> {
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
