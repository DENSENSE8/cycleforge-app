'use client';

/**
 * FIND body for `/search`.
 *
 * ## The route declares the MEASURE, once
 *
 * The page passes `density`, this component publishes it through
 * {@link FindDensityProvider}, and every FIND surface below reads it:
 *
 * | consumer | what it changes |
 * |---|---|
 * | `SearchBrowseShell` | desk card + 1152 measure ⟷ flush full-bleed plane |
 * | `SearchResultsSurface` | `search-hits` DataTable mount ⟷ `SearchResultRow` list |
 * | `SearchRefineControls` | three-cluster band ⟷ one trigger + a sheet |
 * | `SearchDossierFrame` | outline rail beside the stream ⟷ stacked |
 *
 * Nothing below queries the viewport. That is the row's law
 * (`SearchResultRow.tsx` §6) applied to the whole plane, and it is why a
 * narrow desktop station pane can ask for `compact` honestly.
 *
 * ## `?entry=label`
 *
 * The global `+` door. It is not a search: the whole body becomes
 * {@link LabelIntakeDesk} — order number → pair → return / replacement label,
 * one triage surface.
 *
 * Callers: src/app/search/page.tsx.
 * Schema: `?entry=label` (+ `?q=` the order number), `?q=` browse, `?sel=` dossier. No recents rail.
 * User: searching for orders I must see who packed/picked/scanned out and identifier routing.
 */

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { LabelIntakeDesk } from '@/components/outbound/label-intake/LabelIntakeDesk';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';
import {
  FindDensityProvider,
  type FindDensity,
} from '@/components/search/find-density-context';

export function SearchFindSurface({ density }: { density: FindDensity }) {
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const { sel, setSel } = useSearchSelParam();
  const labelEntry = density === 'comfortable' && searchParams.get('entry') === 'label';

  /**
   * The query the operator explicitly chose to BROWSE, by pressing Results in
   * the dossier.
   *
   * It exists because leaving a record is not the same event as arriving at
   * the query. Clearing `?sel=` alone remounts the browse shell, which then
   * re-runs its arrival logic — an identifier resolves out of a warm cache, or
   * a sole hit settles — and re-opens the record in the same frame. The back
   * button looked broken; the plane really did open and close again.
   *
   * Holding the QUERY (not a boolean) is what makes it self-expiring: type
   * something else and auto-open arms itself, with nothing to reset.
   */
  const [browsedQuery, setBrowsedQuery] = useState<string | null>(null);

  const exitToResults = useCallback(() => {
    setBrowsedQuery(q);
    setSel(null);
  }, [q, setSel]);

  if (labelEntry) return <LabelIntakeDesk />;

  return (
    <FindDensityProvider density={density}>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {q && !sel ? (
          <SearchBrowseShell setSel={setSel} autoOpen={browsedQuery !== q} />
        ) : (
          <SearchDetailWorkspace sel={sel} hasQuery={Boolean(q)} onExit={exitToResults} />
        )}
      </div>
    </FindDensityProvider>
  );
}
