'use client';

/**
 * Products Catalog workbench — hub-primary MDM browser.
 * Chrome tabs = Zoho (inventory master) + sales channels. List = LedgerGrid
 * spreadsheet (dashboard SoT). Inventory chip when provider_item_id set.
 *
 * The desk draws no chrome: {@link DataTable} owns the find field, the one
 * filter control and the platform tab strip, all from data this page resolves.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';


import type { CatalogListRow } from '@/components/products/catalog/types';
import { productDetailHref } from '@/components/products/products-view';
import { DataTable } from '@/components/tables/DataTable';
import { CATALOG_TABLE_BINDING } from '@/components/products/catalog/catalog-grid/catalog-table-definition';
import { useCatalogTableLayout } from '@/components/products/catalog/catalog-grid/useCatalogTableLayout';
import { CatalogGridRow } from '@/components/products/catalog/catalog-grid/CatalogGridRow';
import { CatalogBulkActionBar } from '@/components/products/catalog/CatalogBulkActionBar';
import type { RowGroup } from '@/lib/group-rows';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useTableSelection } from '@/hooks/useTableSelection';
import {
  applyCatalogRefine,
  applyCatalogRefineParams,
  catalogPlatformTabs,
  catalogRefineIsHot,
  parseCatalogPlatform,
  parseCatalogRefine,
  type CatalogLinkFilter,
  type CatalogRefineFilters,
} from '@/components/products/catalog/catalog-url-state';
import {
  compareCatalogGridRows,
  catalogSheetColumnsFor,
  catalogSortFactFor,
  defaultDirForCatalogColumn,
  isCatalogColumnSortable,
  type CatalogGridColumn,
  type CatalogGridColumnKey,
} from '@/lib/products/catalog-grid-layout';
import { CATALOG_SELECTION_SCOPE } from '@/lib/selection/catalog-scopes';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';

interface InventoryProviderMeta {
  key: string;
  label: string;
}

const PLATFORM_TABS = catalogPlatformTabs();

export function ProductsCatalogWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState('');
  const platform = parseCatalogPlatform(searchParams.get('platform'));
  const refine = useMemo(() => parseCatalogRefine(searchParams), [searchParams]);
  const refineHot = catalogRefineIsHot(refine);

  const [_filterOpen, setFilterOpen] = useState(false);
  const [items, setItems] = useState<CatalogListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<InventoryProviderMeta | null>(null);
  const [_syncing, setSyncing] = useState(false);

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared catalog link reproduces the same ordering. NOT
  // `?sort=` — that name is reserved for server ordering vocabularies elsewhere.
  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort keys are the mounted track
  // keys; each resolves to its bound field's fact through `catalogSortFactFor`.
  const { effectiveLayout: catalogLayout, fields: catalogFields } = useCatalogTableLayout();
  const columns = useMemo(() => catalogSheetColumnsFor(catalogLayout), [catalogLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, catalogSortFactFor(c)])),
    [columns],
  );

  const { sort, dir, setSort } = useUrlColumnSort<CatalogGridColumnKey>({
    isColumn: (raw) => isCatalogColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForCatalogColumn(columns, key),
  });

  const updateParams = useCallback(
    (updates: Record<string, string | null>, refinePatch?: Partial<CatalogRefineFilters> | null) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) params.delete(key);
        else params.set(key, val);
      }
      if (refinePatch !== undefined) {
        applyCatalogRefineParams(params, refinePatch);
      }
      // Keep view=catalog sticky.
      params.set('view', 'catalog');
      const qs = params.toString();
      router.replace(`/products?${qs}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setCatalogSearch = useCallback((next: string) => setQ(next), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        linkFilter: refine.linkFilter,
        limit: '100',
        offset: '0',
      });
      if (platform !== 'zoho') params.set('platform', platform);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/sku-catalog?${params}`, { credentials: 'same-origin' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
      setProvider(body.inventoryProvider ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [platform, refine.linkFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const refined = applyCatalogRefine(items, refine);
    const sortFact = sort ? (sortFactByKey.get(sort) ?? null) : null;
    if (!sortFact || !dir) return refined;
    return [...refined].sort((a, b) => compareCatalogGridRows(a, b, sortFact, dir));
  }, [items, refine, sort, sortFactByKey, dir]);

  const selectedCatalogRows = useTableSelection<CatalogListRow>(
    CATALOG_SELECTION_SCOPE,
    (r) => r.id,
  );

  const _refreshInventory = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/zoho/items/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'incremental' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Sync failed (${res.status})`);
      }
      toast.success('Inventory catalog refresh started');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Inventory refresh failed');
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const _toggleRefineFlag = useCallback(
    (key: Exclude<keyof CatalogRefineFilters, 'linkFilter'>) => {
      updateParams({}, { [key]: !refine[key] });
    },
    [refine, updateParams],
  );

  const setLinkRefine = useCallback(
    (next: CatalogLinkFilter) => {
      // Toggle off when clicking the active segment.
      updateParams({}, { linkFilter: refine.linkFilter === next ? 'all' : next });
    },
    [refine.linkFilter, updateParams],
  );

  const clearRefine = useCallback(() => {
    updateParams({}, null);
    setFilterOpen(false);
  }, [updateParams]);

  /**
   * The one filter control: inventory-link scope. `zoho` is the default
   * platform, so it is the unfiltered TAB and lights nothing; this narrows
   * within whatever platform is showing.
   */
  const linkFilter = useMemo(
    () => ({
      options: [
        { id: 'active_linked', label: 'Active & Linked' },
        { id: 'unlinked_pending', label: 'Unlinked / pending' },
      ].map((f) => ({ ...f, active: refine.linkFilter === f.id })),
      // `setLinkRefine` already toggles off when the active scope is re-picked.
      onToggle: (id: string) => setLinkRefine(id as CatalogLinkFilter),
      onClearAll: clearRefine,
    }),
    [refine.linkFilter, setLinkRefine, clearRefine],
  );

  const onOpenRow = useCallback(
    (row: CatalogListRow) => {
      router.push(productDetailHref(row.sku));
    },
    [router],
  );

  const countLabel = refineHot
    ? `${visibleItems.length.toLocaleString()} of ${total.toLocaleString()} product${total === 1 ? '' : 's'}`
    : `${total.toLocaleString()} product${total === 1 ? '' : 's'}`;

  const emptyMessage =
    q.trim() || refineHot
      ? 'No products match this search or filter.'
      : platform === 'zoho'
        ? 'No products in the catalog yet. Refresh inventory to sync.'
        : `No products linked to ${PLATFORM_TABS.find((t) => t.id === platform)?.label ?? platform}.`;

  // Grid adapter (was `CatalogGridView`): one catalog spreadsheet mounts the
  // registry host directly. `useTableSelectMode` owns the checkbox toggle and
  // broadcasts on `CATALOG_SELECTION_SCOPE`; the bulk bar above reads the same
  // scope via `useTableSelection`.
  const { selectedIds, toggle } = useTableSelectMode<CatalogListRow>({
    scope: CATALOG_SELECTION_SCOPE,
    selectMode: true,
    rows: visibleItems,
    getId: (r) => r.id,
  });

  const orderGroupsByDate = useMemo<[string, RowGroup<CatalogListRow>[]][]>(
    () => [['', visibleItems.map((r) => ({ key: String(r.id), rows: [r] }))]],
    [visibleItems],
  );

  const onToggleSelect = useCallback(
    (r: CatalogListRow, event: { shiftKey: boolean }) => toggle(r.id, event.shiftKey),
    [toggle],
  );

  const renderCatalogLeaf = useCallback(
    (row: CatalogListRow, visible: readonly CatalogGridColumn[]) => (
      <CatalogGridRow
        key={row.id}
        row={row}
        isSelected={false}
        isChecked={selectedIds.has(row.id)}
        inventoryProviderLabel={provider?.label}
        onOpen={onOpenRow}
        onToggleSelect={onToggleSelect}
        columns={visible}
      />
    ),
    [selectedIds, provider?.label, onOpenRow, onToggleSelect],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-canvas">
      <DashboardScrollShell className="h-full">
        <div className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', 'min-h-0')}>
          <div className="flex shrink-0 items-center justify-between px-0.5 text-role-micro font-medium uppercase tracking-wide text-text-soft">
            <span>{countLabel}</span>
            {provider ? (
              <span className="normal-case tracking-normal text-text-faint">
                Inventory provider: Connected · {provider.label}
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-text-faint">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading catalog…
            </div>
          ) : (
            <DataTable<CatalogListRow, CatalogGridColumnKey, CatalogGridColumn>
              binding={CATALOG_TABLE_BINDING}
              columns={columns}
              fields={catalogFields}
              search={{
                value: q,
                onChange: setCatalogSearch,
                placeholder: 'Filter SKU, title, inventory id…',
              }}
              filter={linkFilter}
              tabs={PLATFORM_TABS.filter((t) => t.id !== 'zoho').map((t) => ({
                id: t.id,
                label: t.label,
              }))}
              activeTab={platform === 'zoho' ? undefined : platform}
              onTabChange={(id) =>
                updateParams({ platform: id === platform || id === 'zoho' ? null : id })
              }
              selectionScope={CATALOG_SELECTION_SCOPE}
              orderGroupsByDate={orderGroupsByDate}
              rows={visibleItems}
              getRowId={(r) => String(r.id)}
              sort={sort}
              dir={dir}
              onSortChange={setSort}
              loading={loading}
              emptyMessage={emptyMessage}
              className="min-h-0 flex-1"
              renderGroup={(group, _stripe, { columns: visible }) =>
                renderCatalogLeaf(group.rows[0], visible)
              }
              renderRow={(row, _stripe, { columns: visible }) => renderCatalogLeaf(row, visible)}
            />
          )}
        </div>
      </DashboardScrollShell>
      <CatalogBulkActionBar scope={CATALOG_SELECTION_SCOPE} selected={selectedCatalogRows} />
    </div>
  );
}
