'use client';

/**
 * Client shell for `/unbox` — shows the SSR first-paint stand-in until the
 * interactive Queue table (or carton workspace) marks primary paint ready.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { UnboxBrowseFirstPaint } from '@/components/receiving/unbox/UnboxBrowseFirstPaint';
import { UnboxPrimaryPaintProvider } from '@/components/receiving/unbox/unbox-primary-paint-context';
import { useSurfacePaintMark, markTier1Priority } from '@/lib/observability/paint-timing';
import { cn } from '@/utils/_cn';

export function UnboxBrowseShell({
  firstPaintRows,
  children,
}: {
  firstPaintRows: ReceivingLineRow[];
  children: React.ReactNode;
}) {
  const [primaryReady, setPrimaryReady] = useState(false);
  const onPrimaryPainted = useCallback(() => setPrimaryReady(true), []);
  const paintValue = useMemo(() => ({ onPrimaryPainted }), [onPrimaryPainted]);

  useSurfacePaintMark('unbox:chrome', true);
  useEffect(() => {
    if (primaryReady || firstPaintRows.length > 0) {
      markTier1Priority('unbox', 'primary');
    }
  }, [primaryReady, firstPaintRows.length]);

  return (
    <UnboxPrimaryPaintProvider value={paintValue}>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        {!primaryReady ? (
          <div className="pointer-events-none absolute inset-0 z-0 flex min-h-0 flex-col">
            <UnboxBrowseFirstPaint rows={firstPaintRows} className="min-h-0 flex-1" />
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
