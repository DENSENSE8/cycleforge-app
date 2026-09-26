'use client';

/** Client shell for `/unbox` — holds the middle **loading field** until the real carton workspace (or a settled empty scan bench) marks… */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { UnboxPrimaryPaintProvider } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';

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
