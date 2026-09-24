'use client';

/**
 * The counter tablet's app shell — the floor the kiosk tree actually uses,
 * and nothing of the warehouse workstation.
 *
 * Kiosk UI paths render chromeless inside `DesktopRouteShell` (no spine, no
 * header), but they still mounted the WHOLE `WarehouseShell` to get there:
 * PostHog, staff realtime, the activity inbox, staff colours, the assistant
 * dock, the ⌘K command bar, the global wedge + SKU scanners, clipboard / throw
 * / vendor-mask hosts, the right rail and the framer drawer. None of it is
 * reachable from the kiosk tree (it has its own wedge scanner and its own
 * device-scoped Ably client), yet every chunk of it was preloaded ahead of the
 * LCP tile photo. Lighthouse simulates LCP over every request issued before
 * the LCP paint, so that dead weight was scored as LCP time.
 *
 * What stays is what the kiosk tree consumes: reduced motion, the query
 * client + toaster + confirm + tooltips + step-up (`Providers`), and auth
 * (`AuthProvider` in kiosk-host mode). The DOM box matches the chromeless
 * `DesktopRouteShell` branch, so layout is unchanged.
 *
 * Callers: `AppShellSwitch` (kiosk UI paths / kiosk host). Affected API: none.
 */

import type { ReactNode } from 'react';
import Providers from '@/components/Providers';
import { AuthProvider, type AuthSessionUser } from '@/contexts/AuthContext';
import { ReducedMotionProvider } from '@/components/providers/ReducedMotionProvider';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

export function KioskAppShell({
  initialUser,
  children,
}: {
  initialUser: AuthSessionUser | null;
  children: ReactNode;
}) {
  return (
    <ReducedMotionProvider>
      <div id="app-root" className="fixed inset-0 flex min-h-0 flex-col overflow-hidden">
        <Providers>
          <AuthProvider initial={initialUser} kioskHost>
            <div className="flex min-h-0 w-full flex-1 overflow-hidden">
              <div className={cn('relative flex h-full min-w-0 flex-1 flex-col overflow-hidden', appChromeClass)}>
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
              </div>
            </div>
          </AuthProvider>
        </Providers>
      </div>
    </ReducedMotionProvider>
  );
}
