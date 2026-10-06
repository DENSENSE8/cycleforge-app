'use client';

/** Client shell for `/unbox` — paints the carton workspace as soon as it is ready. */

import { useCallback, useEffect, useMemo } from 'react';
import { UnboxPrimaryPaintProvider } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';

export function UnboxBrowseShell({ children }: { children: React.ReactNode }) {
  const onPrimaryPainted = useCallback(() => {
    // Carton paint still reports in; nothing covers the desk while it does.
  }, []);
  const paintValue = useMemo(() => ({ onPrimaryPainted }), [onPrimaryPainted]);

  useSurfacePaintMark('unbox:chrome', true);
  useEffect(() => {
    markTier1Priority('unbox', 'primary');
  }, []);

  return (
    <UnboxPrimaryPaintProvider value={paintValue}>
      {children}
    </UnboxPrimaryPaintProvider>
  );
}
