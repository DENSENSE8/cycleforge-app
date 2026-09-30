'use client';

/** Client shell for `/unbox` — holds the middle **loading field** until the real carton workspace (or a settled empty scan bench) marks… */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { UnboxPrimaryPaintProvider } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';

/**
 * The server seeded the MRU carton's lines — the station can paint it in the
 * SSR HTML. An EMPTY seed is still a seed: an unfound carton has no lines by
 * definition, and holding the loader for it made every cold load after an
 * unfound scan wait on the client fetch + workspace chunk (~2.5 s LCP).
 */
function cacheHasSeededCarton(queryClient: ReturnType<typeof useQueryClient>): boolean {
  const entries = queryClient.getQueriesData<{ receiving_lines?: unknown[] }>({
    queryKey: ['receiving-siblings'],
  });
  return entries.some(([, data]) => Array.isArray(data?.receiving_lines));
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
      <UniversalLoader
        isLoading={!primaryReady}
        label="Loading carton"
        paintSurface="unbox:primary"
        data-testid="unbox-station-first-paint"
      >
        {children}
      </UniversalLoader>
    </UnboxPrimaryPaintProvider>
  );
}
