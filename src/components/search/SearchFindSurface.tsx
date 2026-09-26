'use client';

/** FIND body for `/search`. */

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

  /** The query the operator explicitly chose to BROWSE, by pressing Results in the dossier. */
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
