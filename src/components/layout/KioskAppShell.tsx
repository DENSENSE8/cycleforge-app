'use client';

/** The counter tablet's app shell — the floor the kiosk tree actually uses, and nothing of the warehouse workstation. */

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
