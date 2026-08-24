'use client';

/**
 * The provider stack the shell actually needs, and nothing else.
 *
 * The old `components/Providers` carried nine providers — toasts, tooltips,
 * step-up, UI mode, nav-key HUDs, a cheat sheet — every one of them reaching
 * into `@/design-system`, which is being deleted. Two survive here:
 *
 * - **react-query**, because every tool and tile fetches. Options copied from
 *   the old provider verbatim: `gcTime` in particular was cut 30min → 5min for
 *   "massive memory retention", and re-raising it re-opens that.
 * - **auth**, because permission reads have to be synchronous everywhere and
 *   `AuthProvider` is what makes them so. It hydrates from the server session
 *   handed in by `layout.tsx`, so there is no signed-in flash.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import type { AuthSessionUser } from '@/contexts/AuthContext';

export function ShellProviders({
  initialUser,
  children,
}: {
  initialUser: AuthSessionUser | null;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 3 * 60 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: 'always',
            refetchOnReconnect: 'always',
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initial={initialUser}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
