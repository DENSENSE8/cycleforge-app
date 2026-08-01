'use client';

import { Suspense } from 'react';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';

/**
 * Mounts the URL boundary parse for a surface — rule 2 of the isolation contract
 * (`@/lib/routing/route-params`). Renders nothing.
 *
 * Exists as a component, not just the bare hook, for two reasons: a surface's
 * always-mounted host is often an **async server component** (`page.tsx` for
 * `/pack`, `/test`) which cannot call hooks, and the hook needs a `Suspense`
 * boundary because `useSearchParams` suspends during static rendering. Both are
 * handled here once instead of at four call sites.
 *
 * **Placement — this is the part that has gone wrong three times:**
 *
 * - **Route has child segments → put it in `layout.tsx`.** A spec governs its
 *   sub-routes by PREFIX, so a hook in the root `page.tsx` covers exactly one
 *   path. `/inventory` has twelve sibling route files and `/inventory/graph` kept
 *   an undeclared param until this moved to the layout.
 * - **Leaf route → `page.tsx` is fine** (`/review`, `/walk-in`).
 * - **NEVER a sidebar panel.** Those are only conditionally mounted — on desktop
 *   the sidebar is owned by `SidebarContextPanel`, and `RouteShell`'s `actions`
 *   slot only renders below the mobile breakpoint — so the parse silently never
 *   runs. `/sourcing` shipped that way; `/products` and receiving still do.
 *
 * Every claim above was found by `tests/e2e/surface-param-isolation.spec.ts`,
 * whose probe param proves the parse actually ran — not by reading the code.
 */
export function SurfaceParamHygiene() {
  return (
    <Suspense fallback={null}>
      <HygieneEffect />
    </Suspense>
  );
}

function HygieneEffect() {
  useSurfaceParamHygiene();
  return null;
}
