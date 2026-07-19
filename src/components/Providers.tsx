'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AppToaster } from '@/design-system/components/AppToaster';
import { SiteTooltipProvider } from '@/components/providers/SiteTooltipProvider';
import { StepUpProvider } from '@/components/providers/StepUpProvider';
import { UIModeProvider } from '@/design-system/providers/UIModeProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 3 * 60 * 1000,  // 3 min — safe; server-side tag invalidation fires on mutations
                gcTime: 5 * 60 * 1000,     // 5 min (default) — was 30 min, causing massive memory retention
                retry: 1,                  // one retry is enough; 2 doubles perceived lag on errors
                refetchOnWindowFocus: 'always',  // refetch stale data when user returns to the tab
                refetchOnReconnect: 'always', // refetch after network recovery (laptop wake, etc.)
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            <UIModeProvider>
                <SiteTooltipProvider>
                    <StepUpProvider>
                        <div className="flex min-h-0 flex-1 flex-col">
                            {children}
                        </div>
                    </StepUpProvider>
                </SiteTooltipProvider>
            </UIModeProvider>
            <AppToaster />
        </QueryClientProvider>
    );
}
