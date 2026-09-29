'use client';

/**
 * Products Labels workbench — DashboardScrollShell + Products/Recent/History
 * tabs. Products = catalog list | print workspace; Recent/History = unit detail
 * (rail / History lookup set `?historyId=`).
 */

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import { TableStatusBar } from '@/components/tables/TableStatusBar';
import { cn } from '@/utils/_cn';
import { ProductCatalogList } from '@/components/labels/ProductCatalogList';
import { UnitHistoryFinder } from '@/components/labels/UnitHistoryFinder';
import {
  parseLabelsView,
  type LabelsSubView,
} from '@/components/labels/labels-view';
import { SearchField } from '@/design-system/primitives/SearchField';

const MultiSkuSnBarcode = dynamic(() => import('@/components/MultiSkuSnBarcode'), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-text-faint">Loading labels…</div>,
});

const UnitDetailWorkspace = dynamic(
  () =>
    import('@/components/labels/unit-detail/UnitDetailWorkspace').then(
      (m) => m.UnitDetailWorkspace,
    ),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-text-faint">Loading unit detail…</div>,
  },
);

/**
 * The body strip. `recent` is the default view, so it IS the unfiltered body
 * and lights no tab — the same rule every other strip follows.
 */
const LABELS_PRODUCT_TABS = [
  { id: 'print', label: 'Print' },
  { id: 'history', label: 'History' },
] as const;

export function LabelsProductsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseLabelsView(searchParams.get('labelsView'));
  // Band-1 only: no KPI band, no Band-3 triage (find rides the header here).
  const catalogQuery = searchParams.get('q') || '';
  const [historyDraft, setHistoryDraft] = useState('');

  const replaceParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) params.delete(key);
        else params.set(key, val);
      }
      // Always keep view=labels while on this workspace.
      params.set('view', 'labels');
      const qs = params.toString();
      router.replace(qs ? `/products?${qs}` : '/products?view=labels');
    },
    [router, searchParams],
  );

  const handleSelectTab = useCallback(
    (next: LabelsSubView) => {
      replaceParams({
        labelsView: next === 'print' ? null : next,
        // Clear unit selection when leaving detail tabs; keep on recent↔history.
        historyId: next === 'print' ? null : searchParams.get('historyId'),
        // Catalog `q` is Products-tab only.
        q: next === 'print' ? searchParams.get('q') : null,
      });
      setHistoryDraft('');
    },
    [replaceParams, searchParams],
  );


  const handleProductPick = useCallback((sku: string) => {
    window.dispatchEvent(new CustomEvent('sku:fill', { detail: { sku } }));
  }, []);

  const handleHistorySubmit = useCallback((raw: string) => {
    window.dispatchEvent(new CustomEvent('unit-history:lookup', { detail: { raw } }));
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-canvas">
      {/* Unit history lookup is a job verb, not list Find. Catalog Find lives
          in the header and writes `?q=` through NAV_PAGE_DECLS. */}
      {tab === 'history' ? (
        <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card px-2 py-1">
          <SearchField
            value={historyDraft}
            onChange={setHistoryDraft}
            onSearch={handleHistorySubmit}
            placeholder="Look up a unit…"
            className="min-w-0 max-w-[22rem] flex-1"
            tone="neutral"
            hideUnderline
          />
        </div>
      ) : null}
      <>
          {tab === 'print' ? (
            <div className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden">
              <div
                className={cn(
                  MONITOR_SECTION_CARD_SCROLL_CLASS,
                  'flex w-full max-w-[420px] shrink-0 flex-col overflow-hidden lg:max-w-[480px]',
                )}
              >
                <ProductCatalogList query={catalogQuery} onPick={handleProductPick} />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border border-border-soft bg-surface-card">
                <MultiSkuSnBarcode />
              </div>
            </div>
          ) : tab === 'history' ? (
            <div className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden">
              <div
                className={cn(
                  MONITOR_SECTION_CARD_SCROLL_CLASS,
                  'flex w-full max-w-[360px] shrink-0 flex-col overflow-hidden',
                )}
              >
                <UnitHistoryFinder />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <UnitDetailWorkspace />
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <UnitDetailWorkspace />
            </div>
          )}
      </>
      <TableStatusBar
        tabs={LABELS_PRODUCT_TABS}
        activeTab={tab === 'recent' ? undefined : tab}
        onTabChange={(id) => handleSelectTab(id === tab ? 'recent' : (id as LabelsSubView))}
      />
    </div>
  );
}
