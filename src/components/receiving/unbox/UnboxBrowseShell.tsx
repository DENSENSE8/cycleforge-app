'use client';

/**
 * Client shell for `/unbox` — holds the middle **skeleton** until the real
 * carton workspace (or a settled empty scan bench) marks primary paint ready.
 *
 * Only the MIDDLE is covered. The recents rail renders normally underneath this
 * shell's siblings, so the seeded selected row paints first and is never hidden
 * waiting on the carton.
 *
 * When the shell seed already warmed `receiving-siblings`, start ready: the
 * workspace derives during render (`seededWorkspace`) and must NOT sit behind
 * `opacity-0` in the SSR HTML (that hid every Era A LCP win).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UnboxStationFirstPaint } from '@/components/receiving/unbox/UnboxStationFirstPaint';
import { UnboxPrimaryPaintProvider } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';
import { cn } from '@/utils/_cn';

function cacheHasSeededCarton(queryClient: ReturnType<typeof useQueryClient>): boolean {
  const entries = queryClient.getQueriesData<{ receiving_lines?: unknown[] }>({
    queryKey: ['receiving-siblings'],
  });
  return entries.some(
    ([, data]) => Array.isArray(data?.receiving_lines) && data.receiving_lines.length > 0,
  );
}

export function UnboxBrowseShell({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [primaryReady, setPrimaryReady] = useState(() => cacheHasSeededCarton(queryClient));
  const onPrimaryPainted = useCallback(() => setPrimaryReady(true), []);
  const paintValue = useMemo(() => ({ onPrimaryPainted }), [onPrimaryPainted]);

  useSurfacePaintMark('unbox:chrome', true);
  useEffect(() => {
    markTier1Priority('unbox', 'primary');
  }, []);

  return (
    <UnboxPrimaryPaintProvider value={paintValue}>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        {!primaryReady ? (
          <div className="pointer-events-none absolute inset-0 z-0 flex min-h-0 flex-col">
            <UnboxStationFirstPaint className="min-h-0 flex-1" />
          </div>
        ) : null}
        <div
          className={cn(
            'relative z-10 flex min-h-0 w-full flex-1 flex-col',
            !primaryReady && 'opacity-0',
          )}
        >
          {children}
        </div>
      </div>
    </UnboxPrimaryPaintProvider>
  );
}
