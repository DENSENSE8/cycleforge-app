'use client';

/** Picks the app shell for the request while preserving separate desk and kiosk client boundaries. */

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import Providers from '@/components/Providers';
import { WarehouseShell } from '@/components/layout/WarehouseShell';
import type { AuthSessionUser } from '@/contexts/AuthContext';
import { RouteModeRegion } from '@/design-system/providers/RouteModeRegion';
import { appRootClass } from '@/design-system/tokens/mobile-viewport';

/**
 * The counter tablet's floor — its own chunk for the same reason as the
 * warehouse route frame: a kiosk path must not download the counter client it
 * never renders. See `KioskAppShell`.
 */
const KioskAppShell = dynamic(() =>
  import('@/components/layout/KioskAppShell').then((m) => m.KioskAppShell),
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
  // Every frame's page slot wears the route's declared mode — one mount for
  // public, kiosk, desk and phone (`src/lib/routing/mode-registry.ts`).
  const page = <RouteModeRegion>{children}</RouteModeRegion>;

  if (publicChrome) {
    /* PUBLIC CHROME — signed-out entry surfaces only. */
    return (
      <div
        id="app-root"
        className={appRootClass(mobileTree)}
      >
        <Providers publicChrome>{page}</Providers>
      </div>
    );
  }

  if (kioskHost) {
    return <KioskAppShell initialUser={initialUser}>{page}</KioskAppShell>;
  }

  return (
    <WarehouseShell
      initialUser={initialUser}
      mobileTree={mobileTree}
      shellSeed={shellSeed}
    >
      {page}
    </WarehouseShell>
  );
}
