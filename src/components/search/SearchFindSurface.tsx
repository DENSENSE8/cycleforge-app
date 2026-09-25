'use client';

/**
 * FIND body shared by `/search` and `/m/search`.
 *
 * ## The route declares the MEASURE, once
 *
 * Both routes mount this same tree, which is why the desktop rebuild landed on
 * the phone undesigned. The fix is not two trees — it is one declared fact.
 * Each page passes `density`, this component publishes it through
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
 * ## Query field ownership
 *
 * The compact phone surface always owns a query field because its shell has no
 * global Find face. Desktop normally finds through `GlobalHeaderSearch`; the
 * named `?entry=label` door deliberately owns an order-number field so the
 * global `+` begins with order identity instead of opening a generic action or
 * customer-support surface.
 *
 * Callers: src/app/search/page.tsx, src/app/m/(shell)/search/page.tsx.
 * Schema: `?entry=label`, `?q=` browse, `?sel=` dossier. No recents rail.
 * User: searching for orders I must see who packed/picked/scanned out and identifier routing.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchField } from '@/design-system/primitives/SearchField';
import { SearchBrowseShell } from '@/components/search/SearchBrowseShell';
import { SearchDetailWorkspace } from '@/components/search/SearchDetailWorkspace';
import { OrderIntakeOverlay } from '@/components/outbound/orders/intake/OrderIntakeOverlay';
import { useSearchSelParam } from '@/hooks/useSearchSelParam';
import { SEARCH_SEL_PARAM } from '@/lib/search/search-selection';
import {
  FindDensityProvider,
  type FindDensity,
} from '@/components/search/find-density-context';

function findPathFor(pathname: string | null): '/search' | '/m/search' {
  return pathname === '/m/search' || Boolean(pathname?.startsWith('/m/search/'))
    ? '/m/search'
    : '/search';
}

function SearchFindQueryField({ labelEntry = false }: { labelEntry?: boolean }) {
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
    <div className="shrink-0 bg-surface-card px-3 py-2">
      <SearchField
        value={draft}
        onChange={setDraft}
        onSearch={commit}
        onClear={() => commit('')}
        placeholder={labelEntry ? 'Order number…' : 'Order, serial, tracking…'}
        autoFocus={labelEntry}
        tone="neutral"
        hideUnderline
      />
    </div>
  );
}

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
  const [exceptionNumber, setExceptionNumber] = useState<string | null>(null);
  const [exceptionOrderId, setExceptionOrderId] = useState<number | null>(null);

  const openExceptionIntake = useCallback((searchedOrderNumber: string) => {
    setExceptionOrderId(null);
    setExceptionNumber(searchedOrderNumber);
  }, []);

  const closeExceptionIntake = useCallback(() => {
    setExceptionNumber(null);
    setExceptionOrderId(null);
  }, []);

  const bindExceptionOrder = useCallback(
    (orderId: number) => {
      setExceptionOrderId(orderId);
      setSel({ entityType: 'order', id: orderId });
    },
    [setSel],
  );

  const exitToResults = useCallback(() => {
    setBrowsedQuery(q);
    setSel(null);
  }, [q, setSel]);

  return (
    <FindDensityProvider density={density}>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {density === 'compact' || labelEntry ? (
          <SearchFindQueryField labelEntry={labelEntry} />
        ) : null}
        {q && !sel ? (
          <SearchBrowseShell
            setSel={setSel}
            autoOpen={browsedQuery !== q}
            onOrderNotFound={labelEntry ? openExceptionIntake : undefined}
          />
        ) : (
          <SearchDetailWorkspace
            sel={sel}
            hasQuery={Boolean(q)}
            onExit={exitToResults}
            emptyTitle={labelEntry ? 'Add shipping labels' : undefined}
            emptyDescription={
              labelEntry
                ? 'Enter an order number. The matching order opens in the To-ship ledger before any label is purchased.'
                : undefined
            }
          />
        )}
      </div>
      {labelEntry ? (
        <OrderIntakeOverlay
          open={exceptionNumber !== null}
          orderId={exceptionOrderId}
          initialDraft={exceptionNumber ? { orderNumber: exceptionNumber } : undefined}
          onOrderCreated={bindExceptionOrder}
          onClose={closeExceptionIntake}
        />
      ) : null}
    </FindDensityProvider>
  );
}
