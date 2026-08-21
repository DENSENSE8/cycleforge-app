'use client';

/**
 * Client shell for `/unbox` — holds the middle **loading field** until the real
 * carton workspace (or a settled empty scan bench) marks primary paint ready.
 *
 * Only the MIDDLE is covered. The recents rail renders normally underneath this
 * shell's siblings, so the seeded selected row paints first and is never hidden
 * waiting on the carton.
 *
 * When the shell seed already warmed `receiving-siblings`, start ready: the
 * workspace derives during render (`seededWorkspace`) and must NOT sit behind
 * `opacity-0` in the SSR HTML (that hid every Era A LCP win).
 *
 * **The stand-in is {@link UniversalLoader}, not a drawn skeleton** (2026-08-20).
 * `UnboxStationFirstPaint` painted bars where the identity band and line rows
 * would land — geometry that had to be re-cut by hand every time the carton
 * header moved. The field owns no geometry: the real workspace stays mounted
 * underneath and keeps defining layout, so the reveal is still CLS 0 and the
 * cover no longer has anything to drift from.
 *
 * The field is `pointer-events-none` (the loader's default), matching what the
 * absolutely-positioned skeleton did here.
 */

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
