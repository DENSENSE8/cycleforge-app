'use client';

/**
 * Client shell for `/search` — holds the house loading field over the body
 * until the `?sel=` record has actually resolved.
 *
 * It replaces the old station pane's bare `<div className="min-h-0 flex-1"
 * aria-busy />`: a deep-linked record used to land on an empty white plane with
 * only the header pulse to say anything was happening. Same recipe as
 * {@link UnboxBrowseShell} — the field owns no geometry, the real body stays
 * mounted underneath and keeps defining layout, so the reveal is CLS 0.
 *
 * **The cover is COLD LAND only, and `primaryReady` is one-way.** Record→record
 * afterwards is {@link SearchDetailWorkspace}'s opaque hard-cut crossfade, which
 * is already seamless; re-covering on every swap would flash a field over it.
 *
 * **`search:primary` is stamped when the cover LIFTS, never on mount.** Marking
 * it at mount is how a surface reports a fast LCP for a plane that is still
 * empty — the mark and the loader's `paintSurface` attribution have to name the
 * same moment or the number is fiction.
 */

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
