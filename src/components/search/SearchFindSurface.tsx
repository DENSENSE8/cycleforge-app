'use client';

/** FIND body for `/search`. */

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { PastedRefsDesk } from '@/components/search/PastedRefsDesk';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { LabelIntakeDesk } from '@/components/outbound/label-intake/LabelIntakeDesk';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';
import { parseRefInParam } from '@/lib/receiving/reconcile';
import { SEARCH_REFS_PARAM } from '@/lib/search/pasted-refs';
import { SearchAssistantFrame } from '@/components/search/assistant/SearchAssistantFrame';
import {
  FindDensityProvider,
  type FindDensity,
} from '@/components/search/find-density-context';

export function SearchFindSurface({ density }: { density: FindDensity }) {
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const pasted = parseRefInParam(searchParams.get(SEARCH_REFS_PARAM));
  const { sel, setSel } = useSearchSelParam();
  const labelEntry = density === 'comfortable' && searchParams.get('entry') === 'label';

  /** The query the operator explicitly chose to BROWSE, by pressing Results in the dossier. */
  const [browsedQuery, setBrowsedQuery] = useState<string | null>(null);

  const exitToResults = useCallback(() => {
    setBrowsedQuery(q);
    setSel(null);
  }, [q, setSel]);

  if (labelEntry) return <LabelIntakeDesk />;

  const body = (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {pasted.refs.length > 0 ? (
        <PastedRefsDesk />
      ) : q && !sel ? (
        <SearchBrowseShell setSel={setSel} autoOpen={browsedQuery !== q} />
      ) : (
        <SearchDetailWorkspace sel={sel} hasQuery={Boolean(q)} onExit={exitToResults} />
      )}
    </div>
  );

  return (
    <FindDensityProvider density={density}>
      {/* Desk: the assistant rides the search (⌘J); the phone keeps /m/assistant. */}
      {density === 'comfortable' ? (
        <SearchAssistantFrame sel={sel} query={q} onSelect={setSel}>
          {body}
        </SearchAssistantFrame>
      ) : (
        body
      )}
    </FindDensityProvider>
  );
}
