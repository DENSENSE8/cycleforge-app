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
 * - **MotionConfig**, added 2026-08-24 with the feedback-motion ruling. It
 *   exists for exactly one prop: `reducedMotion="user"`, which makes
 *   `prefers-reduced-motion` a SHELL-WIDE fact rather than something each
 *   call site has to remember. See `src/shell/feedback.ts` for what motion
 *   is and is not allowed to do here.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { TooltipProvider } from '@/components/ui/tooltip';
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
      <MotionConfig reducedMotion="user">
        {/* One provider for every tooltip in the shell. Radix shares a
            delay timer across it, so crossing an icon rail shows the
            second and third label immediately instead of re-waiting the
            300ms on each — the behaviour a native `title` can never have. */}
        <TooltipProvider>
          <AuthProvider initial={initialUser}>{children}</AuthProvider>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
