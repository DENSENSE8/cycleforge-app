'use client';

/**
 * Picks the app shell for the request: public chrome, or the warehouse client.
 *
 * ## Why this exists as a CLIENT component
 *
 * The branch used to live directly in `app/layout.tsx`, with `WarehouseShell`
 * behind `next/dynamic`. That reads like a code-split and is documented as one,
 * but **`next/dynamic` inside a Server Component does not produce a lazy client
 * boundary under Turbopack** — the client module lands in the route's reference
 * manifest and is emitted as a `<script>` regardless of which branch renders.
 *
 * Measured on `/signin` (production build, 2026-08-29): the public branch
 * rendered correctly (sign-in card in the HTML, no `MasterNav`, no
 * `InstallPrompt`) while the page still downloaded
 * `<script src=".../db436df3b2340e81.js">` — the `WarehouseShell` chunk — and
 * with it the framer runtime. 155KB gz of 518KB (29%) of the one public route's
 * first-load JS was operator client it never renders.
 *
 * A `dynamic()` call inside a **client** module is the ordinary, supported
 * lazy-chunk case, so hosting the switch here is what makes the split real.
 * SSR is unaffected: no `ssr: false` anywhere — the warehouse branch still
 * server-renders exactly as before, it is only the *public* branch that stops
 * paying for it.
 *
 * `children` is a server-rendered RSC subtree passed through as a prop, which
 * keeps the page itself a Server Component.
 */

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import Providers from '@/components/Providers';
import type { AuthSessionUser } from '@/contexts/AuthContext';

const WarehouseShell = dynamic(() =>
  import('@/components/layout/WarehouseShell').then((m) => m.WarehouseShell),
);

export function AppShellSwitch({
  publicChrome,
  initialUser,
  kioskHost,
  mobileTree,
  shellSeed,
  children,
}: {
  publicChrome: boolean;
  initialUser: AuthSessionUser | null;
  kioskHost: boolean;
  mobileTree: boolean;
  shellSeed: DehydratedState | null;
  children: ReactNode;
}) {
  if (publicChrome) {
    /*
      PUBLIC CHROME — signed-out entry surfaces only. `Providers` is the floor
      the card genuinely uses (query client, toaster, confirm host, tooltips);
      the whole warehouse client is skipped, and now genuinely not downloaded.
      The `<div id="app-root">` box is identical, so page layout is unchanged.
    */
    return (
      <div id="app-root" className="fixed inset-0 flex min-h-0 flex-col overflow-hidden">
        <Providers publicChrome>{children}</Providers>
      </div>
    );
  }

  return (
    <WarehouseShell
      initialUser={initialUser}
      kioskHost={kioskHost}
      mobileTree={mobileTree}
      shellSeed={shellSeed}
    >
      {children}
    </WarehouseShell>
  );
}
