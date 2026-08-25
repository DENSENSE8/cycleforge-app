'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AppToaster } from '@/design-system/components/AppToaster';
import { ConfirmDialogHost } from '@/design-system/components/confirm';
import { SiteTooltipProvider } from '@/components/providers/SiteTooltipProvider';
import { StepUpProvider } from '@/components/providers/StepUpProvider';
import { UIModeProvider } from '@/design-system/providers/UIModeProvider';
import { NavRegionPickHud } from '@/lib/keyboard/nav-keys/NavRegionPickHud';
import { KeyboardShortcutsCheatSheet } from '@/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet';

/**
 * `publicChrome` — the signed-out entry surfaces (`/signin`, `/signup`, share
 * links). They keep the data + feedback floor (query client, tooltips, toaster,
 * confirm host) and skip the three pieces that only mean something inside the
 * warehouse client: step-up re-auth, the nav-region pick HUD, and the keyboard
 * cheat sheet. See `lib/auth/public-chrome-paths.ts` for why the public route is
 * worth separating at all.
 */
export default function Providers({
    children,
    publicChrome = false,
}: {
    children: React.ReactNode;
    publicChrome?: boolean;
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 3 * 60 * 1000,  // 3 min — safe; server-side tag invalidation fires on mutations
                gcTime: 5 * 60 * 1000,     // 5 min (default) — was 30 min, causing massive memory retention
                retry: 1,                  // one retry is enough; 2 doubles perceived lag on errors
                // `true`, NOT `'always'`. `'always'` refetches on focus regardless
                // of `staleTime`, which turned every alt-tab, scanner focus bounce
                // and print-popup return into a full page refetch: measured on
                // `/triage`, one focus cycle fired 26 requests / 104KB — including
                // `/api/catalog/*` (5min staleTime) and a 43.8KB rail list — and a
                // second cycle seconds later fired the identical 26. `true` asks
                // the same question but honours each query's own staleTime, so a
                // bounce inside the window is free. Freshness does not depend on
                // this: mutations reconcile through Ably + the `app-refresh-data`
                // refresh bus, and a query with no data is stale by definition, so
                // an errored/never-loaded query still retries on focus.
                refetchOnWindowFocus: true,
                refetchOnReconnect: 'always', // refetch after network recovery (laptop wake, etc.)
            },
        },
    }));

    const body = <div className="flex min-h-0 flex-1 flex-col">{children}</div>;

    return (
        <QueryClientProvider client={queryClient}>
            <UIModeProvider>
                <SiteTooltipProvider>
                    {publicChrome ? body : <StepUpProvider>{body}</StepUpProvider>}
                </SiteTooltipProvider>
            </UIModeProvider>
            {!publicChrome && <NavRegionPickHud />}
            {!publicChrome && <KeyboardShortcutsCheatSheet />}
            <AppToaster />
            <ConfirmDialogHost />
        </QueryClientProvider>
    );
}
