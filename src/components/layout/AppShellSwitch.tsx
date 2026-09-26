'use client';

/** Picks the app shell for the request: */

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import Providers from '@/components/Providers';
import type { AuthSessionUser } from '@/contexts/AuthContext';

const WarehouseShell = dynamic(() =>
  import('@/components/layout/WarehouseShell').then((m) => m.WarehouseShell),
);
/**
 * The counter tablet's floor — its own chunk for the same reason as the
 * warehouse one: a kiosk path must not download the operator client it never
 * renders. See `KioskAppShell`.
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
  if (publicChrome) {
    /* PUBLIC CHROME — signed-out entry surfaces only. */
    return (
      <div id="app-root" className="fixed inset-0 flex min-h-0 flex-col overflow-hidden">
        <Providers publicChrome>{children}</Providers>
      </div>
    );
  }

  if (kioskHost) {
    return <KioskAppShell initialUser={initialUser}>{children}</KioskAppShell>;
  }

  return (
    <WarehouseShell
      initialUser={initialUser}
      mobileTree={mobileTree}
      shellSeed={shellSeed}
    >
      {children}
    </WarehouseShell>
  );
}
