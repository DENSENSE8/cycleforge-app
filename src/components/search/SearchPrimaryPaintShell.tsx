'use client';

/** Client shell for `/search` — holds the house loading field over the body until the `?sel=` record has actually resolved. */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { SearchPrimaryPaintProvider } from '@/components/search/search-primary-paint-context';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { SEARCH_SEL_PARAM } from '@/lib/search/search-selection';

export function SearchPrimaryPaintShell({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const hasSel = Boolean((searchParams.get(SEARCH_SEL_PARAM) ?? '').trim());

  // No `?sel=` → nothing to wait for. The browse body's contract is that the
  // header pending bar owns loading and the body never paints a hold, so a
  // field over it would be exactly the "gray overlay" that contract bans.
  const [primaryReady, setPrimaryReady] = useState(!hasSel);
  const onPrimaryPainted = useCallback(() => setPrimaryReady(true), []);
  const paintValue = useMemo(() => ({ onPrimaryPainted }), [onPrimaryPainted]);

  useEffect(() => {
    if (!hasSel) setPrimaryReady(true);
  }, [hasSel]);

  useSurfacePaintMark('search:chrome', true);
  useSurfacePaintMark('search:primary', primaryReady);

  return (
    <SearchPrimaryPaintProvider value={paintValue}>
      <UniversalLoader
        isLoading={!primaryReady}
        label="Loading record"
        paintSurface="search:primary"
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        data-testid="search-primary-first-paint"
      >
        {children}
      </UniversalLoader>
    </SearchPrimaryPaintProvider>
  );
}
