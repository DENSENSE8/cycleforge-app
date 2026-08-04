'use client';

/**
 * Products Catalog workbench — hub-primary MDM browser.
 * Chrome tabs = Zoho (inventory master) + sales channels. List = LedgerGrid
 * spreadsheet (dashboard SoT). Inventory chip when provider_item_id set.
 *
 * Chrome recipe matches Dashboard · Outbound / Labels: DashboardScrollShell +
 * workbench gutters + WorkbenchChromeHeader (tabs · search · filter · trailing).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw } from '@/components/Icons';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { Button } from '@/design-system/primitives';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { productDetailHref } from '@/components/products/products-view';
import { CatalogGridView } from '@/components/products/catalog/catalog-grid/CatalogGridView';
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
  defaultDirForCatalogGridSort,
  isCatalogGridSortable,
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
  const q = searchParams.get('q') || '';
  const platform = parseCatalogPlatform(searchParams.get('platform'));
  const refine = useMemo(() => parseCatalogRefine(searchParams), [searchParams]);
  const refineHot = catalogRefineIsHot(refine);

  const [filterOpen, setFilterOpen] = useState(false);
  const [items, setItems] = useState<CatalogListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<InventoryProviderMeta | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared catalog link reproduces the same ordering. NOT
  // `?sort=` — that name is reserved for server ordering vocabularies elsewhere.
  const { sort, dir, setSort } = useUrlColumnSort<CatalogGridColumnKey>({
    isColumn: isCatalogGridSortable,
    defaultDir: defaultDirForCatalogGridSort,
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

  const setCatalogSearch = useCallback(
    (next: string) => {
      updateParams({ q: next.trim() || null });
    },
    [updateParams],
  );

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
    if (!sort || !dir) return refined;
    return [...refined].sort((a, b) => compareCatalogGridRows(a, b, sort, dir));
  }, [items, refine, sort, dir]);

  const refreshInventory = useCallback(async () => {
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

  const toggleRefineFlag = useCallback(
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

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-canvas">
      <DashboardScrollShell
        className="h-full"
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <WorkbenchChromeHeader
              density="band"
              tabs={PLATFORM_TABS.map((t) => ({
                id: t.id,
                label: t.label,
              }))}
              activeTab={platform}
              onTabChange={(id) =>
                updateParams({
                  platform: id === 'zoho' ? null : id,
                })
              }
              solidTone="accent"
              search={
                <TechRailSearchBar
                  variant="chrome"
                  value={q}
                  onChange={setCatalogSearch}
                  placeholder="Filter SKU, title, inventory id…"
                  isSearching={loading && Boolean(q.trim())}
                  className="w-40 shrink-0 lg:w-56"
                />
              }
              right={
                <WorkbenchFilterPopover
                  open={filterOpen}
                  onOpenChange={setFilterOpen}
                  hot={refineHot}
                  label="Filter catalog"
                >
                  <WorkbenchFilterGroupLabel>Inventory link</WorkbenchFilterGroupLabel>
                  <WorkbenchFilterMenuRow
                    label="Active & Linked"
                    active={refine.linkFilter === 'active_linked'}
                    onClick={() => setLinkRefine('active_linked')}
                  />
                  <WorkbenchFilterMenuRow
                    label="Unlinked / Pending"
                    active={refine.linkFilter === 'unlinked_pending'}
                    onClick={() => setLinkRefine('unlinked_pending')}
                  />
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterGroupLabel>Status</WorkbenchFilterGroupLabel>
                  <WorkbenchFilterMenuRow
                    label="Pending only"
                    active={refine.pendingOnly}
                    onClick={() => toggleRefineFlag('pendingOnly')}
                  />
                  <WorkbenchFilterMenuRow
                    label="Inactive only"
                    active={refine.inactiveOnly}
                    onClick={() => toggleRefineFlag('inactiveOnly')}
                  />
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterGroupLabel>Missing</WorkbenchFilterGroupLabel>
                  <WorkbenchFilterMenuRow
                    label="No channels"
                    active={refine.missingChannels}
                    onClick={() => toggleRefineFlag('missingChannels')}
                  />
                  <WorkbenchFilterMenuRow
                    label="No manuals"
                    active={refine.missingManuals}
                    onClick={() => toggleRefineFlag('missingManuals')}
                  />
                  <WorkbenchFilterMenuRow
                    label="No QC checklist"
                    active={refine.missingQc}
                    onClick={() => toggleRefineFlag('missingQc')}
                  />
                  {refineHot ? (
                    <>
                      <WorkbenchFilterDivider />
                      <WorkbenchFilterMenuRow
                        label="Clear filters"
                        active={false}
                        onClick={clearRefine}
                      />
                    </>
                  ) : null}
                </WorkbenchFilterPopover>
              }
              trailing={
                <WorkbenchTrailingCluster
                  after={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={syncing}
                      onClick={() => void refreshInventory()}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
                      Refresh inventory
                    </Button>
                  }
                />
              }
            />
          </div>
        }
      >
        <div className={cn(WORKBENCH_BODY_COLUMN, 'flex min-h-0 flex-1 flex-col gap-2')}>
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
            <CatalogGridView
              rows={visibleItems}
              loading={loading}
              emptyMessage={emptyMessage}
              selectionScope={CATALOG_SELECTION_SCOPE}
              inventoryProviderLabel={provider?.label}
              onOpenRow={onOpenRow}
              sort={sort}
              dir={dir}
              onSortChange={setSort}
              className="min-h-0 flex-1"
            />
          )}
        </div>
      </DashboardScrollShell>
    </div>
  );
}
