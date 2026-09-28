'use client';

/**
 * The phone's Products step — the same two shelves as the desk, one thumb
 * wide: a sliding Sales · Repair service switch over ONE find field, because
 * a customer orders sales items and repair services on one call and both go
 * on the one cart (operator 2026-09-27).
 *
 * - FIND (≥2 chars) searches the shelf the switch is on — Sales: exact
 *   identity (SKU, item #, UPC, FNSKU) and catalog words; Repair service: the
 *   service catalog. A tap adds; Enter adds the first hit.
 * - BROWSE: the shelf (`useCatalogShelf`, one per shelf so each keeps its
 *   crumb) — breadcrumb trail, the level's sub-category chips, the tile grid.
 *   A tile adds the LISTING itself; it is never paired to a catalog product by
 *   SKU, because storefront and catalog SKUs collide.
 *
 * Tiles and grid are the triage shelf (`@/design-system/components/triage-shelf`),
 * never the counter's `KIOSK_POS_*`. The shell owns the title, path chips and
 * the Back/Continue dock.
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { X } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TriageShelfGrid } from '@/design-system/components/triage-shelf/TriageShelfGrid';
import { TriageShelfTile } from '@/design-system/components/triage-shelf/TriageShelfTile';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { CATALOG_PAGE_SIZE, useCatalogShelf, type CatalogShelfProduct } from '@/hooks/orders/useCatalogShelf';
import { CATALOG_SHELVES, type CatalogShelf } from '@/lib/orders/intake/catalog-shelf';
import { cartUnits, hitAvailability, listingAvailability, listingLineOf, listingUnitCents, type ListingLine } from '@/lib/orders/intake/checkout-model';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { formatCents } from '@/lib/orders/manual-order-draft';
import { cn } from '@/utils/_cn';
import { MobileCatalogFilter, MobileCatalogTrail } from './MobileCatalogNav';

/** Debounce between keystrokes and the search call. */
const SEARCH_DEBOUNCE_MS = 150;
const REPAIR_TAG = 'Repair service';
const FIND_LABEL: Record<CatalogShelf, string> = {
  sales: 'Find a product — title, SKU, item #, UPC',
  repair: 'Find a repair service — device, part, issue',
};

export interface MobileProductsStepProps {
  currency: string;
  lines: readonly IntakeLine[];
  shelf: CatalogShelf;
  onShelf: (shelf: CatalogShelf) => void;
  /** A Sales find hit — the catalog product. */
  onAdd: (hit: IntakeProductHit) => void;
  /** A shelf tile (or a Repair find hit) — the storefront listing itself. */
  onAddListing: (listing: ListingLine) => void;
}

export function MobileProductsStep({ currency, lines, shelf, onShelf, onAdd, onAddListing }: MobileProductsStepProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<IntakeProductHit[]>([]);
  const [hitsLoading, setHitsLoading] = useState(false);
  const q = query.trim();
  const finding = q.length >= 2;
  const sales = useCatalogShelf('sales');
  const repair = useCatalogShelf('repair');
  const active = shelf === 'sales' ? sales : repair;

  const repairSearch = repair.search;
  useEffect(() => {
    if (shelf === 'repair') {
      const timer = window.setTimeout(() => repairSearch(finding ? q : null), SEARCH_DEBOUNCE_MS);
      return () => window.clearTimeout(timer);
    }
    repairSearch(null);
    if (!finding) {
      setHits([]);
      setHitsLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setHitsLoading(true);
    const timer = window.setTimeout(() => {
      searchProducts(q, ctrl.signal)
        .then(setHits)
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setHitsLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [q, finding, shelf, repairSearch]);

  const { byCatalog, byListing, byShelf } = useMemo(() => cartUnits(lines), [lines]);

  const addHit = (hit: IntakeProductHit) => {
    onAdd(hit);
    setQuery('');
    setHits([]);
  };
  const addListing = (product: CatalogShelfProduct, fromFind: boolean) => {
    onAddListing(listingLineOf(product));
    if (fromFind) setQuery('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && finding) {
      event.preventDefault();
      if (shelf === 'sales' && hits[0]) addHit(hits[0]);
      else if (shelf === 'repair' && repair.searching && repair.products[0]) addListing(repair.products[0], true);
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      setQuery('');
    }
  };

  const tag = shelf === 'repair' ? REPAIR_TAG : null;
  const listingTile = (product: CatalogShelfProduct, index: number, fromFind: boolean) => {
    const cents = listingUnitCents(product);
    return (
      <TriageShelfTile
        key={product.id}
        title={product.name}
        imageUrl={product.thumbnailUrl}
        price={cents != null ? formatCents(cents, currency) : null}
        sku={product.sku}
        availability={listingAvailability(product)}
        tag={tag}
        inCart={byListing.get(product.id) ?? 0}
        index={index}
        onAdd={() => addListing(product, fromFind)}
        testId={fromFind ? 'm-order-product-hit' : 'm-order-catalog-tile'}
      />
    );
  };

  return (
    <div className="flex flex-col" data-testid="m-order-products" data-shelf={shelf}>
      <div className="space-y-2 border-b border-mode-rule px-3 py-2">
        <TabSwitch
          tabs={CATALOG_SHELVES.map((s) => ({ id: s.id, label: s.label, count: byShelf[s.id] || undefined }))}
          activeTab={shelf}
          onTabChange={(id) => onShelf(id as CatalogShelf)}
          size="sm"
          countStyle="plain"
        />
        <TextField
          label={FIND_LABEL[shelf]}
          placeholder={FIND_LABEL[shelf]}
          value={query}
          onChange={setQuery}
          onKeyDown={onKeyDown}
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputClassName="pr-12 text-base"
          data-testid="m-order-product-query"
          trailing={
            query ? (
              <IconButton
                icon={<X className="size-4" aria-hidden />}
                ariaLabel="Clear search"
                size="touch"
                onClick={() => setQuery('')}
                data-testid="m-order-product-clear"
              />
            ) : null
          }
        />
      </div>

      {finding ? (
        shelf === 'sales' ? (
          <TriageShelfGrid
            label="Matching products"
            count={hits.length}
            loading={hitsLoading}
            error={null}
            empty="No product matches — try the SKU or item #, or clear to browse."
            testId="m-order-product-hits"
          >
            {hits.map((hit, index) => (
              <TriageShelfTile
                key={hit.skuCatalogId}
                title={hit.title}
                imageUrl={hit.imageUrl}
                price={hit.suggestedUnitCents != null ? formatCents(hit.suggestedUnitCents, currency) : null}
                sku={hit.sku}
                availability={hitAvailability(hit)}
                inCart={byCatalog.get(hit.skuCatalogId) ?? 0}
                index={index}
                onAdd={() => addHit(hit)}
                testId="m-order-product-hit"
              />
            ))}
          </TriageShelfGrid>
        ) : (
          <TriageShelfGrid
            label="Matching repair services"
            count={repair.searching ? repair.products.length : 0}
            loading={repair.loading || !repair.searching}
            error={repair.error}
            empty="No repair service matches — clear to browse."
            hasMore={repair.searching && repair.hasMore}
            loadingMore={repair.loadingMore}
            pageSize={CATALOG_PAGE_SIZE}
            onLoadMore={repair.loadMore}
            testId="m-order-product-hits"
          >
            {repair.products.map((product, index) => listingTile(product, index, true))}
          </TriageShelfGrid>
        )
      ) : null}

      <div className={cn('flex flex-col', finding && 'hidden')} data-testid="m-order-catalog">
        <MobileCatalogTrail catalog={active} />
        <MobileCatalogFilter catalog={active} />
        <TriageShelfGrid
          label={shelf === 'sales' ? 'Products' : 'Repair services'}
          count={active.searching ? 0 : active.products.length}
          loading={active.loading}
          error={active.error}
          empty="Nothing on this shelf."
          hasMore={active.hasMore}
          loadingMore={active.loadingMore}
          pageSize={CATALOG_PAGE_SIZE}
          onLoadMore={active.loadMore}
          testId="m-order-catalog-grid"
        >
          {active.products.map((product, index) => listingTile(product, index, false))}
        </TriageShelfGrid>
      </div>
    </div>
  );
}
