'use client';

/**
 * FIND body shared by `/search` and `/m/search`.
 *
 * Callers: src/app/search/page.tsx, src/app/m/(shell)/search/page.tsx.
 * Schema: `?q=` browse, `?sel=` dossier. No recents rail.
 * User: searching for orders I must see who packed/picked/scanned out and identifier routing.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchField } from '@/design-system/primitives/SearchField';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';
import { SEARCH_SEL_PARAM } from '@/lib/search/search-selection';

function findPathFor(pathname: string | null): '/search' | '/m/search' {
  return pathname === '/m/search' || Boolean(pathname?.startsWith('/m/search/'))
    ? '/m/search'
    : '/search';
}

function SearchFindQueryField() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(urlQ);

  useEffect(() => {
    setDraft(urlQ);
  }, [urlQ]);

  const commit = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = value.trim();
      if (next) params.set('q', next);
      else params.delete('q');
      params.delete(SEARCH_SEL_PARAM);
      const findPath = findPathFor(pathname);
      const qs = params.toString();
      router.replace(qs ? `${findPath}?${qs}` : findPath, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="shrink-0 border-b border-border-hairline bg-surface-card px-3 py-2">
      <SearchField
        value={draft}
        onChange={setDraft}
        onSearch={commit}
        onClear={() => commit('')}
        placeholder="Order, serial, tracking…"
        tone="neutral"
        hideUnderline
      />
    </div>
  );
}

export function SearchFindSurface({ queryField }: { queryField: boolean }) {
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const { sel, setSel } = useSearchSelParam();

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {queryField ? <SearchFindQueryField /> : null}
      {q && !sel ? (
        <SearchBrowseShell setSel={setSel} />
      ) : (
        <SearchDetailWorkspace sel={sel} hasQuery={Boolean(q)} onExit={() => setSel(null)} />
      )}
    </div>
  );
}
