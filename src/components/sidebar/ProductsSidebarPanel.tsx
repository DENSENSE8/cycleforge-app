'use client';

/**
 * Sidebar surface for `/products`. Hosts pickers / rails per view. L2 views
 * (Catalog · Manuals · Labels · Pairing · QC · Kit) live in GlobalHeader
 * (`HeaderModeSwitcher` ← SIDEBAR_PAGE_NAV) — no sidebar mode rail twin.
 *
 * Mounted by DashboardSidebar when routeKey === 'products'.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { ShoppingCart, Star, Sparkles, List, Package, Check } from '@/components/Icons';
import { PairingQueueList } from '@/components/products/pairing/PairingQueueList';
import { PairingUnmatchedSection } from '@/components/products/pairing/PairingUnmatchedSection';
import { AddOrPairSkuModal } from '@/components/products/pairing/AddOrPairSkuModal';
import { PAIRING_SORTS, type PairingQueueItem, type PairingSort, type UnmappedPlatformId } from '@/components/products/pairing/types';
import {
  parseProductsView,
} from '@/components/products/products-view';
import { LibraryBrowser } from '@/components/manuals/LibraryBrowser';
import { ProductLabelsRecentRail } from '@/components/labels/ProductLabelsRecentRail';
import { SearchBar } from '@/components/ui/SearchBar';

const PAIRING_SORT_ITEMS: HorizontalSliderItem[] = [
  { id: 'volume',     label: 'Ordered',      icon: ShoppingCart },
  { id: 'confidence', label: 'Confidence',   icon: Star },
  { id: 'count',      label: 'Suggestions',  icon: Sparkles },
  { id: 'title',      label: 'A-Z', icon: List },
];

const DEFAULT_PAIRING_SORT: PairingSort = 'volume';

function parsePairingSort(raw: string | null): PairingSort {
  const match = PAIRING_SORTS.find((sort) => sort === raw);
  return match ?? DEFAULT_PAIRING_SORT;
}

export function ProductsSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Parse a pasted / bookmarked link at the boundary, so a URL that predates the
  // /products spec cannot deliver another surface's params into this one.
  const view = parseProductsView(searchParams.get('view'));
  const currentQuery = searchParams.get('q') || '';
  const pairingSort = parsePairingSort(searchParams.get('sort'));

  const [searchInput, setSearchInput] = useState(currentQuery);
  useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) params.delete(key);
        else params.set(key, val);
      }
      const qs = params.toString();
      router.replace(qs ? `/products?${qs}` : '/products');
    },
    [router, searchParams],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      updateParams({ q: value.trim() || null });
    },
    [updateParams],
  );

  const handlePairingSortChange = useCallback(
    (id: string) => updateParams({ sort: id === 'volume' ? null : id }),
    [updateParams],
  );

  const isManuals = view === 'manuals';
  const isLabels = view === 'labels';
  const isPairing = view === 'pairing';
  const isQc = view === 'qc';
  const isKit = view === 'kit';
  const isCatalog = view === 'catalog';

  const searchPlaceholder = isPairing
    ? 'Filter SKU, title, or any platform ID…'
    : isManuals
      ? 'Fuzzy filter folders & manuals…'
      : 'Filter products…';

  return (
    <SidebarShell
      className={appChromeClass}
      headerAbove={
        <>
          {/* Labels + Catalog own browse search in the workbench chrome. */}
          {!isLabels && !isCatalog ? (
            <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
              <SearchBar
                size="compact"
                variant="blue"
                value={searchInput}
                onChange={handleSearchChange}
                onClear={() => handleSearchChange('')}
                placeholder={searchPlaceholder}
              />
            </div>
          ) : null}
        </>
      }
      headerRows={[
        isPairing ? (
          <HorizontalButtonSlider
            items={PAIRING_SORT_ITEMS}
            value={pairingSort}
            onChange={handlePairingSortChange}
            variant="nav"
            dense
            className="w-full"
            aria-label="Pairing queue sort"
          />
        ) : null,
      ]}
      bodyClassName="flex flex-col overflow-hidden p-0"
    >
      {isLabels ? (
        <ProductLabelsRecentRail />
      ) : isPairing ? (
        <PairingSidebarQueue query={searchInput} sort={pairingSort} />
      ) : isQc ? (
        <QcSidebarPicker query={searchInput} />
      ) : isKit ? (
        <KitPartsPicker query={searchInput} />
      ) : isCatalog ? (
        <div className={`${SIDEBAR_GUTTER} space-y-2 py-4 text-role-caption text-text-soft`}>
          <p className="font-semibold text-text-muted">Product catalog</p>
          <p>
            Hub-primary list of warehouse products. Inventory-linked rows show the Inventory chip;
            expand a row to see channel products and FBA IDs.
          </p>
          <p className="text-text-faint">
            Use Unlinked / Pending in the main pane to surface MDM gaps.
          </p>
        </div>
      ) : isManuals ? (
        <LibraryBrowser query={searchInput} basePath="/products" />
      ) : null}
    </SidebarShell>
  );
}


// ─── Pairing sidebar queue ─────────────────────────────────────────────────

/**
 * The pairing queue list, hosted directly in the sidebar (replaces the
 * standalone left rail in ProductsPairingShell). Selection writes ?sku=
 * so the main pane (ProductHubPanel) picks it up via URL. Search comes in
 * from the shared sidebar SearchBar (`?q=`).
 */
function PairingSidebarQueue({ query, sort }: { query: string; sort: PairingSort }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSku = searchParams.get('sku') || null;

  // Add/pair modal state — opened from the "not in the queue" section for an
  // unmapped identifier (`pending` set) or to create a brand-new inventory SKU.
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState<UnmappedPlatformId | null>(null);

  const openSku = useCallback(
    (sku: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', 'pairing');
      params.set('sku', sku);
      router.replace(`/products?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleSelect = useCallback((item: PairingQueueItem) => openSku(item.sku), [openSku]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PairingUnmatchedSection
        query={query}
        onPairIdentifier={(id) => { setPending(id); setModalOpen(true); }}
        onAddSku={() => { setPending(null); setModalOpen(true); }}
      />

      <div className="min-h-0 flex-1">
        <PairingQueueList
          query={query}
          sort={sort}
          selectedSku={selectedSku}
          onSelect={handleSelect}
        />
      </div>

      <AddOrPairSkuModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        query={query}
        pending={pending}
        onDone={(sku) => { setModalOpen(false); openSku(sku); }}
      />
    </div>
  );
}

// ─── QC sidebar product picker ────────────────────────────────────────────

/**
 * Product list for the QC Checklist view. Searches the SKU catalog and, on
 * select, writes `?view=qc&skuId=<catalogId>` so the main pane
 * (QcChecklistWorkspace) loads that SKU's checklist. The selected row stays
 * highlighted. Empty query fetches the top page so there's always a list.
 */
function QcSidebarPicker({ query }: { query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSkuId = searchParams.get('skuId');

  // hasQc restricts the list to SKUs that actually have checklist items linked
  // — searches sku + title server-side, so searchField is left at its default.
  const { data, isLoading, isError } = useSkuCatalogSearch(query, {
    limit: 50,
    allowEmpty: true,
    hasQc: true,
  });

  const items = data ?? [];
  const trimmedQuery = query.trim();

  const handleSelect = useCallback(
    (item: SkuCatalogItem) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', 'qc');
      params.set('skuId', String(item.id));
      router.replace(`/products?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {isLoading && items.length === 0 ? (
        <div className="inset-empty text-center text-role-caption font-semibold text-text-faint">
          Loading products…
        </div>
      ) : isError ? (
        <div className="inset-empty text-center text-role-caption font-semibold text-red-500">
          Couldn't load products.
        </div>
      ) : items.length === 0 ? (
        <div className="inset-empty text-center text-role-caption font-semibold text-text-faint">
          {trimmedQuery ? 'No matches with a QC checklist.' : 'No products have a QC checklist yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {items.map((item) => {
            const isSelected = selectedSkuId === String(item.id);
            return (
              <li key={item.id}>
                {/* ds-raw-button: catalog picker list-row (image + title/sku + selected check), one-row anatomy — not the Button primitive shape */}
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  aria-current={isSelected}
                  className={`ds-raw-button flex w-full items-center gap-3 ${SIDEBAR_GUTTER} py-2 text-left transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-blue-50'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-canvas ring-1 ring-border-soft">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Package className="h-4 w-4 text-text-faint" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`text-role-caption font-semibold leading-snug break-words ${
                        isSelected ? 'text-blue-700' : 'text-text-default'
                      }`}
                    >
                      {item.product_title || item.sku}
                    </span>
                    <span className="truncate font-mono text-role-micro text-text-soft">{item.sku}</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Kit-parts sidebar product picker ─────────────────────────────────────

/**
 * Product list for the Kit Parts view. Mirrors QcSidebarPicker, but searches the
 * FULL catalog (no hasQc-style filter) — authoring "what's in the box" is most
 * often done on a SKU that has NO parts yet, so we must surface every product,
 * not only ones already populated. On select, writes `?view=kit&skuId=<catalogId>`
 * so the main pane (KitPartsWorkspace) loads that SKU's BOM editor.
 */
function KitPartsPicker({ query }: { query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSkuId = searchParams.get('skuId');

  const { data, isLoading, isError } = useSkuCatalogSearch(query, {
    limit: 50,
    allowEmpty: true,
  });

  const items = data ?? [];
  const trimmedQuery = query.trim();

  const handleSelect = useCallback(
    (item: SkuCatalogItem) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', 'kit');
      params.set('skuId', String(item.id));
      router.replace(`/products?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {isLoading && items.length === 0 ? (
        <div className="inset-empty text-center text-role-caption font-semibold text-text-faint">
          Loading products…
        </div>
      ) : isError ? (
        <div className="inset-empty text-center text-role-caption font-semibold text-red-500">
          Couldn&apos;t load products.
        </div>
      ) : items.length === 0 ? (
        <div className="inset-empty text-center text-role-caption font-semibold text-text-faint">
          {trimmedQuery ? 'No matches.' : 'No products available.'}
        </div>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {items.map((item) => {
            const isSelected = selectedSkuId === String(item.id);
            return (
              <li key={item.id}>
                {/* ds-raw-button: catalog picker list-row (image + title/sku + selected check), one-row anatomy — not the Button primitive shape */}
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  aria-current={isSelected}
                  className={`ds-raw-button flex w-full items-center gap-3 ${SIDEBAR_GUTTER} py-2 text-left transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-blue-50'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-canvas ring-1 ring-border-soft">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Package className="h-4 w-4 text-text-faint" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`text-role-caption font-semibold leading-snug break-words ${
                        isSelected ? 'text-blue-700' : 'text-text-default'
                      }`}
                    >
                      {item.product_title || item.sku}
                    </span>
                    <span className="truncate font-mono text-role-micro text-text-soft">{item.sku}</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

