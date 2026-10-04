'use client';

/**
 * The Products step (desk) — ONE triage shelf for everything a caller orders:
 * sales items AND repair services go on the same cart, because customers order
 * both on one call (operator 2026-09-27).
 *
 * - **Shelf switch** (trail, top right): Sales · Repair service — a sliding
 *   `TabSwitch`, each face counting its units on the cart; ⌥/Alt+R flips it
 *   from anywhere on the step (the page binds it). Each shelf keeps its own
 *   crumb, scope and page (`useCatalogShelf`, one per shelf).
 * - **Find** (one field, trail left, glyph chip inline): it searches the shelf
 *   the switch is on — Sales: exact identity (SKU, item #, UPC, FNSKU) and
 *   catalog words (`/api/orders/intake/products`); Repair service: the service
 *   catalog (`…/ecwid-products?shelf=repair&q=`). ↑/↓ move, Enter adds and the
 *   cursor stays; Esc clears back to the browse grid where it was.
 * - **Browse**: the shelf's favorites (else the whole shelf), `All products ›
 *   category` crumbs, back chevron and category menu. A tap adds the LISTING
 *   (title, SKU, price, listing id as item #) — never a SKU-guessed catalog
 *   product: storefront and catalog SKUs are separate namespaces that collide.
 *
 * Painted with the triage shelf (`@/design-system/components/triage-shelf`),
 * never the counter's `ProductSelector` / `KIOSK_POS_*` — the counter's shelf
 * is the counter's alone.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TriageShelfGrid } from '@/design-system/components/triage-shelf/TriageShelfGrid';
import { TriageShelfTile } from '@/design-system/components/triage-shelf/TriageShelfTile';
import { TriageShelfTrail } from '@/design-system/components/triage-shelf/TriageShelfTrail';
import { TRIAGE_SHELF_TRAIL_ICON } from '@/design-system/components/triage-shelf/triage-shelf-tokens';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchField } from '@/design-system/primitives/SearchField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CATALOG_PAGE_SIZE, useCatalogShelf, type CatalogShelfProduct, type CatalogShelfState } from '@/hooks/orders/useCatalogShelf';
import { CATALOG_SHELVES, type CatalogShelf } from '@/lib/orders/intake/catalog-shelf';
import {
  cartUnits,
  hitAvailability,
  listingAvailability,
  listingLineOf,
  listingUnitCents,
  type ListingLine,
} from '@/lib/orders/intake/checkout-model';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { formatCents } from '@/lib/orders/manual-order-draft';
import { cn } from '@/utils/_cn';

/** Pause after the last keystroke before the search call (SearchField's draft debounce). */
const SEARCH_DEBOUNCE_MS = 150;
const RESULTS_ID = 'checkout-product-results';
const FAVORITES = '__favorites';
const ALL = '__all';
const REPAIR_TAG = 'Repair service';

/** One tile of the find list, whichever shelf answered. */
interface FindItem {
  key: string;
  title: string;
  imageUrl: string | null;
  price: string | null;
  sku: string;
  availability: string;
  inCart: number;
  add: () => void;
}

export const CheckoutProductSearch = forwardRef<
  HTMLInputElement,
  {
    currency: string;
    lines: readonly IntakeLine[];
    shelf: CatalogShelf;
    onShelf: (shelf: CatalogShelf) => void;
    onAdd: (hit: IntakeProductHit) => void;
    onAddListing: (listing: ListingLine) => void;
  }
>(function CheckoutProductSearch({ currency, lines, shelf, onShelf, onAdd, onAddListing }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current!, []);
  const sales = useCatalogShelf('sales');
  const repair = useCatalogShelf('repair');
  const active = shelf === 'sales' ? sales : repair;

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<IntakeProductHit[]>([]);
  const [hitsLoading, setHitsLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const q = query.trim();
  const finding = q.length >= 2;

  /* ── Find: Sales asks the identity search, Repair service its own shelf ── */
  const repairSearch = repair.search;
  useEffect(() => {
    setCursor(0);
    if (shelf === 'repair') {
      repairSearch(finding ? q : null);
      return;
    }
    repairSearch(null);
    if (!finding) {
      setHits([]);
      setHitsLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setHitsLoading(true);
    searchProducts(q, ctrl.signal)
      .then(setHits)
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setHitsLoading(false);
      });
    return () => ctrl.abort();
  }, [q, finding, shelf, repairSearch]);

  const { byCatalog, byListing, byShelf } = useMemo(() => cartUnits(lines), [lines]);

  const listingItem = (product: CatalogShelfProduct): FindItem => {
    const unitCents = listingUnitCents(product);
    return {
      key: product.id,
      title: product.name,
      imageUrl: product.thumbnailUrl,
      price: unitCents != null ? formatCents(unitCents, currency) : null,
      sku: product.sku,
      availability: listingAvailability(product),
      inCart: byListing.get(product.id) ?? 0,
      add: () => onAddListing(listingLineOf(product)),
    };
  };

  const clear = () => {
    setQuery('');
    setHits([]);
  };
  const findItems: FindItem[] = !finding
    ? []
    : shelf === 'sales'
      ? hits.map((hit) => ({
          key: String(hit.skuCatalogId),
          title: hit.title,
          imageUrl: hit.imageUrl,
          price: hit.suggestedUnitCents != null ? formatCents(hit.suggestedUnitCents, currency) : null,
          sku: hit.sku,
          availability: hitAvailability(hit),
          inCart: byCatalog.get(hit.skuCatalogId) ?? 0,
          add: () => {
            onAdd(hit);
            clear();
          },
        }))
      : repair.searching
        ? repair.products.map((product) => {
            const item = listingItem(product);
            return { ...item, add: () => (item.add(), clear()) };
          })
        : [];
  const findLoading = shelf === 'sales' ? hitsLoading : repair.loading;

  /* ── Find: keyboard (bubbles up from the field's input) ── */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' && findItems.length > 0) {
      event.preventDefault();
      setCursor((i) => (i + 1) % findItems.length);
    } else if (event.key === 'ArrowUp' && findItems.length > 0) {
      event.preventDefault();
      setCursor((i) => (i - 1 + findItems.length) % findItems.length);
    } else if (event.key === 'Enter' && finding && findItems[cursor]) {
      // preventDefault also stops the field's form submit.
      event.preventDefault();
      findItems[cursor]!.add();
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
  };

  const shelfLabel = CATALOG_SHELVES.find((s) => s.id === shelf)!.label.toLowerCase();
  const find = (
    <div className={cn('flex min-w-0 items-center gap-2', finding ? 'flex-1' : 'w-[20rem] shrink-0')} onKeyDown={onKeyDown} data-testid="checkout-product-find">
      {/* ds-raw-button: trail glyph chip — focuses the field, the counter's search button */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Find a product"
        onClick={() => inputRef.current?.focus()}
        className={cn(TRIAGE_SHELF_TRAIL_ICON, finding && 'bg-mode-hover text-mode-ink', focusRing('control'))}
        data-testid="checkout-product-find-button"
      >
        <Search className="size-4" aria-hidden />
      </button>
      <SearchField
        inputRef={inputRef}
        fillHost
        hideUnderline
        hideLeadingIcon
        debounceMs={SEARCH_DEBOUNCE_MS}
        isSearching={findLoading}
        placeholder={shelf === 'sales' ? 'Find a product — title, SKU, item #, UPC' : 'Find a repair service — device, part, issue'}
        value={query}
        onChange={setQuery}
        className="h-9 min-w-0 flex-1"
        inputProps={{
          role: 'combobox',
          'aria-label': `Find in ${shelfLabel}`,
          'aria-autocomplete': 'list',
          'aria-expanded': findItems.length > 0,
          'aria-controls': RESULTS_ID,
          'aria-activedescendant': findItems[cursor] ? `checkout-hit-${findItems[cursor]!.key}` : undefined,
          autoComplete: 'off',
          'data-testid': 'checkout-product-query',
        }}
      />
    </div>
  );

  const shelfSwitch = (
    <HoverTooltip label="Switch Sales ↔ Repair service" shortcut="Alt + R" asChild>
      <div className="flex items-center gap-1.5" data-testid="checkout-shelf-switch">
        <TabSwitch
          tabs={CATALOG_SHELVES.map((s) => ({ id: s.id, label: s.label, count: byShelf[s.id] || undefined }))}
          activeTab={shelf}
          onTabChange={(id) => {
            onShelf(id as CatalogShelf);
            inputRef.current?.focus();
          }}
          fit="hug"
          size="sm"
          countStyle="plain"
        />
      </div>
    </HoverTooltip>
  );

  return (
    <div
      className="flex h-[min(64vh,44rem)] min-h-[22rem] flex-col overflow-hidden rounded-mode border border-mode-rule bg-mode-canvas"
      data-testid="checkout-product-search"
      data-shelf={shelf}
    >
      <TriageShelfTrail
        find={find}
        searching={finding}
        rootLabel={active.scope === 'favorites' ? 'Favorites' : 'All products'}
        crumbs={active.breadcrumbs}
        onRoot={() => active.goCategory(null)}
        onCrumb={active.goCategory}
        onBack={active.goBack}
        menu={categoryMenu(active)}
        end={shelfSwitch}
        testId="checkout-shelf-trail"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {finding ? (
          <TriageShelfGrid
            label={`Matching ${shelfLabel}`}
            listboxId={RESULTS_ID}
            count={findItems.length}
            loading={findLoading}
            error={shelf === 'repair' ? repair.error : null}
            empty={shelf === 'sales' ? 'No product matches — try the SKU or item #, or Esc to browse.' : 'No repair service matches — Esc to browse.'}
            hasMore={shelf === 'repair' && repair.hasMore}
            loadingMore={repair.loadingMore}
            pageSize={CATALOG_PAGE_SIZE}
            onLoadMore={repair.loadMore}
            testId="checkout-product-hits"
          >
            {findItems.map((item, index) => (
              <TriageShelfTile
                key={item.key}
                title={item.title}
                imageUrl={item.imageUrl}
                price={item.price}
                sku={item.sku}
                availability={item.availability}
                tag={shelf === 'repair' ? REPAIR_TAG : null}
                inCart={item.inCart}
                index={index}
                onAdd={item.add}
                testId="checkout-product-hit"
                option={{ id: `checkout-hit-${item.key}`, active: index === cursor, onHover: () => setCursor(index) }}
              />
            ))}
          </TriageShelfGrid>
        ) : (
          <TriageShelfGrid
            label={shelf === 'sales' ? 'Products' : 'Repair services'}
            count={active.products.length}
            loading={active.loading}
            error={active.error}
            empty="Nothing on this shelf."
            hasMore={active.hasMore}
            loadingMore={active.loadingMore}
            pageSize={CATALOG_PAGE_SIZE}
            onLoadMore={active.loadMore}
            testId="checkout-shelf-grid"
          >
            {active.products.map((product, index) => {
              const item = listingItem(product);
              return (
                <TriageShelfTile
                  key={item.key}
                  title={item.title}
                  imageUrl={item.imageUrl}
                  price={item.price}
                  sku={item.sku}
                  availability={item.availability}
                  tag={shelf === 'repair' ? REPAIR_TAG : null}
                  inCart={item.inCart}
                  index={index}
                  onAdd={item.add}
                  testId="checkout-shelf-tile"
                />
              );
            })}
          </TriageShelfGrid>
        )}
      </div>
    </div>
  );
});

/** The trail's category menu: Favorites (when the shelf has them) · All products · this level's sub-categories. */
function categoryMenu(shelf: CatalogShelfState) {
  const options = [
    ...(shelf.hasFavorites ? [{ value: FAVORITES, label: 'Favorites' }] : []),
    { value: ALL, label: 'All products' },
    ...(shelf.categoryId && shelf.breadcrumbs.length > 0
      ? [{ value: shelf.categoryId, label: shelf.breadcrumbs[shelf.breadcrumbs.length - 1]!.name }]
      : []),
    ...shelf.categories.filter((c) => c.id !== shelf.categoryId).map((c) => ({ value: c.id, label: c.name })),
  ];
  const value = shelf.categoryId ?? (shelf.scope === 'favorites' ? FAVORITES : ALL);
  return {
    value,
    options,
    onChange: (next: string) => {
      if (next === FAVORITES) shelf.showFavorites();
      else if (next === ALL) shelf.showAll();
      else if (next !== shelf.categoryId) shelf.goCategory(next);
    },
  };
}
