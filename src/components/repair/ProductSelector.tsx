'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from '../Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { SearchField } from '@/design-system/primitives/SearchField';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { cornerClass, HEADER_ICON_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  KIOSK_BAND_SEARCH_ROW,
  KIOSK_META,
  KIOSK_MODE_SPINE_ICON,
  KIOSK_MODE_SPINE_ROW_IDLE,
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_TILE_TITLE,
} from '@/app/kiosk/kiosk-chrome';
import {
  KIOSK_POS_BROWSE_SCROLL,
  KIOSK_POS_CANVAS,
  KIOSK_POS_CARD,
  KIOSK_POS_CARD_CAPTION,
  KIOSK_POS_CARD_SELECTED,
  KIOSK_POS_CARD_SELECTED_FRAME,
  KIOSK_POS_CARD_SELECT_DOT,
  KIOSK_POS_CARD_SELECT_DOT_OFF,
  KIOSK_POS_CARD_SELECT_DOT_ON,
  KIOSK_POS_CATEGORY,
  KIOSK_POS_CATEGORY_ACTIVE,
  KIOSK_POS_CATEGORY_IDLE,
  KIOSK_POS_GRID,
  KIOSK_POS_IMAGE_WELL,
} from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';
import {
  isCatalogRootSearchLevel,
  resolveCatalogProductPool,
  shouldHydrateRootSearchPool,
} from './catalog-search-pool';

export interface ProductSelection {
  type: string;
  model: string;
  sourceSku?: string | null;
}

interface ProductSelectorProps {
  onSelect: (product: ProductSelection) => void;
  selectedProduct: ProductSelection | null;
  onPriceChange?: (price: string) => void;
  /** When true, the component fills its parent height using flex layout */
  fillHeight?: boolean;
  /** Controlled selected items — state lives in parent */
  selectedItems?: SelectedItem[];
  onSelectedItemsChange?: (items: SelectedItem[]) => void;
  /**
   * Route prefix for the `ecwid-categories` / `ecwid-products` pair. Staff use
   * the default session-authed `/api/repair`; the kiosk passes
   * `/api/kiosk/repair` for the device-authed twins (same response shapes).
   */
  apiBasePath?: string;
  /**
   * Hides the "Other -- Manual Entry" free-text escape hatch. The kiosk sets
   * this so a walk-in repair always resolves to a real Ecwid SKU (pricing +
   * downstream ticketing depend on it); staff keep manual entry for the
   * one-off devices that genuinely aren't in the catalog.
   */
  hideManualEntry?: boolean;
  /**
   * Let the results flow in the page instead of scrolling inside a capped
   * region. The default `max-h-[50vh]` box nests a second scrollbar inside an
   * already-scrolling page — fine in the staff modal, but on the kiosk it
   * halves the usable area and hides results behind a scroll the customer
   * can't see. Mutually exclusive with `fillHeight`.
   */
  flowInPage?: boolean;
  /**
   * `flush` = stacked edge-to-edge chrome (square rows). Ignored when
   * `layout="kiosk-split"` — that path uses the flush POS surface recipes.
   * Staff intake keeps the soft `default` cards.
   */
  appearance?: 'default' | 'flush';
  /**
   * `stacked` = staff / legacy single column.
   * `kiosk-split` = trail row (optional spine toggle + All products combobox),
   * then command rail under that row beside search + products.
   */
  layout?: 'stacked' | 'kiosk-split';
  /** Browse vs checkout — checkout replaces the products stage with `stageContent`. */
  catalogPhase?: 'browse' | 'checkout';
  /** Continue to checkout when the cart has items (kiosk-split). */
  onContinue?: () => void;
  /** Return to browse without clearing the cart (kiosk-split). */
  onAddAnotherItem?: () => void;
  /**
   * Lead of the catalog trail (kiosk-split) — command dropdown.
   */
  sidebarHeader?: React.ReactNode;
  /**
   * Trailing trail cluster (kiosk-split) — cart, paperwork, Work/Show/Verify.
   */
  trailEnd?: React.ReactNode;
  /** Checkout detail pane — mounts in the right stage when phase is checkout. */
  stageContent?: React.ReactNode;
  /** Optional title band for the browse stage (right). */
  browseHeader?: React.ReactNode;
  /**
   * Controlled catalog search. The kiosk spine + browse bar share this one
   * engine — do not add a second index. Uncontrolled when omitted (staff).
   */
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  /** Hide the browse-stage search when the expanded spine hosts it. */
  hideBrowseSearch?: boolean;
  /**
   * Hide the left-rail cart tray (v2 shell owns a persistent right ledger).
   * Default false so staff stacked + legacy split keep the tray.
   */
  hideCartTray?: boolean;
}

interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  hasChildren: boolean;
  isLeaf: boolean;
  depth: number;
  fullPath: string;
}

interface EcwidProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  thumbnailUrl: string | null;
  enabled: boolean;
  inStock: boolean;
}

export interface SelectedItem {
  id: string;
  name: string;
  price: number | null;
  sku: string;
}

interface CategoriesResponse {
  success: boolean;
  error?: string;
  roots?: Array<{ id: string | null; name: string }>;
  currentParentId?: string | null;
  breadcrumbs?: Array<{ id: string; name: string }>;
  categories?: CategoryNode[];
}

interface ProductsResponse {
  success: boolean;
  error?: string;
  products?: EcwidProduct[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

const PRODUCT_PAGE_SIZE = 10;
/** Combobox sentinel — not an Ecwid id. Clears the category filter. */
const KIOSK_ALL_PRODUCTS_VALUE = 'all-products';

export function ProductSelector({
  onSelect, selectedProduct, onPriceChange, fillHeight,
  selectedItems: controlledItems, onSelectedItemsChange,
  apiBasePath = '/api/repair', hideManualEntry = false, flowInPage = false,
  appearance = 'default',
  layout = 'stacked',
  catalogPhase = 'browse',
  onContinue,
  onAddAnotherItem,
  sidebarHeader,
  trailEnd = null,
  stageContent,
  browseHeader: _browseHeader,
  searchQuery,
  onSearchQueryChange,
  hideBrowseSearch: _hideBrowseSearch,
  hideCartTray = false,
}: ProductSelectorProps) {
  const kioskSplit = layout === 'kiosk-split';
  /** Flush POS chrome — only the kiosk-split catalog path. */
  const pos = kioskSplit;
  /** Stacked flush chrome — staff/legacy; never when POS split is active. */
  const flush = appearance === 'flush' && !pos;
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<EcwidProduct[]>([]);
  const [rootName, setRootName] = useState('Bose Repair Service');
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalSearch, setInternalSearch] = useState('');
  const searchControlled = searchQuery !== undefined;
  const search = searchControlled ? searchQuery : internalSearch;
  const setSearch = (value: string) => {
    if (!searchControlled) setInternalSearch(value);
    onSearchQueryChange?.(value);
  };
  const [internalItems, setInternalItems] = useState<SelectedItem[]>([]);
  const selectedItems = controlledItems ?? internalItems;
  const setSelectedItems = (updater: SelectedItem[] | ((prev: SelectedItem[]) => SelectedItem[])) => {
    const next = typeof updater === 'function' ? updater(selectedItems) : updater;
    if (onSelectedItemsChange) onSelectedItemsChange(next);
    else setInternalItems(next);
  };
  const [otherModelText, setOtherModelText] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [productsOffset, setProductsOffset] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  // Whole-catalog pool, lazily loaded the first time someone types at the root
  // level. Without it, searching from the root only filtered CATEGORY NAMES —
  // typing a product ("Wave Radio II") found nothing until you had already
  // drilled into the right category, which is backwards for a front-desk flow.
  const [rootSearchPool, setRootSearchPool] = useState<EcwidProduct[] | null>(null);
  const [loadingRootSearch, setLoadingRootSearch] = useState(false);
  const searchInputHostRef = useRef<HTMLDivElement | null>(null);
  /** After first category hydrate, never swap the sidebar for a Loading… block. */
  const categoriesHydratedRef = useRef(false);
  /** Ignore stale category responses when the operator drills faster than the network. */
  const categoryFetchGen = useRef(0);

  const deriveSourceSku = (items: SelectedItem[]): string | null => {
    const candidate = items
      .map((item) => String(item.sku || '').trim())
      .find(Boolean);

    return candidate || null;
  };

  const totalPriceOf = (items: SelectedItem[]) =>
    items.reduce((sum, i) => sum + (i.price ?? 0), 0);

  const fetchCategoryLevel = async (parentId: string | null) => {
    const gen = ++categoryFetchGen.current;
    const initialLoad = !categoriesHydratedRef.current;
    // Only the cold start paints a Loading block — subsequent drills keep the
    // accordion mounted and swap in the next level when the response lands.
    if (initialLoad) setLoadingCategories(true);
    setError(null);
    setShowAllProducts(false);
    setProductsOffset(0);
    setHasMoreProducts(false);
    setSearch('');
    // Root clears the browse grid on staff stacked; kiosk-split keeps the prior
    // grid until fetchAllProducts replaces it (no empty flash on the right stage).
    if (!parentId && !kioskSplit) setProducts([]);

    try {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const response = await fetch(`${apiBasePath}/ecwid-categories${query}`);
      const payload = (await response.json()) as CategoriesResponse;

      if (gen !== categoryFetchGen.current) return;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load categories');
      }

      const roots = Array.isArray(payload.roots) ? payload.roots : [];
      if (roots.length > 0 && roots[0]?.name) setRootName(roots[0].name);

      const rows = Array.isArray(payload.categories) ? payload.categories : [];
      setCategories(rows);
      setCurrentCategoryId(payload.currentParentId ?? null);
      setBreadcrumbs(Array.isArray(payload.breadcrumbs) ? payload.breadcrumbs : []);
      const alreadyHydrated = categoriesHydratedRef.current;
      categoriesHydratedRef.current = true;

      if (parentId) {
        void fetchProducts(parentId, 0, false);
      } else if (kioskSplit && alreadyHydrated) {
        // Mount already started the root catalog fetch in parallel. Subsequent
        // returns to root still refresh the grid.
        void fetchAllProducts(0, false);
      }
    } catch (err) {
      if (gen !== categoryFetchGen.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load categories');
      if (initialLoad) setCategories([]);
    } finally {
      if (gen === categoryFetchGen.current) setLoadingCategories(false);
    }
  };

  const fetchProducts = async (categoryId: string, offset = 0, append = false) => {
    if (append) setLoadingMoreProducts(true);
    else setLoadingProducts(true);
    try {
      const response = await fetch(
        `${apiBasePath}/ecwid-products?categoryId=${encodeURIComponent(categoryId)}&limit=${PRODUCT_PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await response.json()) as ProductsResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to load products');
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setProducts((prev) => (append ? [...prev, ...rows] : rows));
      setProductsOffset(offset + rows.length);
      setHasMoreProducts(Boolean(payload.hasMore));
    } catch {
      if (!append) setProducts([]);
      setHasMoreProducts(false);
    } finally {
      if (append) setLoadingMoreProducts(false);
      else setLoadingProducts(false);
    }
  };

  const fetchAllProducts = async (offset = 0, append = false) => {
    if (append) setLoadingMoreProducts(true);
    else setLoadingProducts(true);
    setError(null);
    if (!append) setSearch('');
    try {
      const response = await fetch(`${apiBasePath}/ecwid-products?mode=all&limit=${PRODUCT_PAGE_SIZE}&offset=${offset}`);
      const payload = (await response.json()) as ProductsResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to load products');
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setProducts((prev) => (append ? [...prev, ...rows] : rows));
      setShowAllProducts(true);
      setProductsOffset(offset + rows.length);
      setHasMoreProducts(Boolean(payload.hasMore));
    } catch (err) {
      if (!append) setProducts([]);
      setError(err instanceof Error ? err.message : 'Failed to load products');
      if (!append) setShowAllProducts(false);
      setHasMoreProducts(false);
    } finally {
      if (append) setLoadingMoreProducts(false);
      else setLoadingProducts(false);
    }
  };

  const loadMoreProducts = () => {
    if (loadingProducts || loadingMoreProducts || !hasMoreProducts) return;
    if (showAllProducts) {
      void fetchAllProducts(productsOffset, true);
      return;
    }
    if (currentCategoryId) {
      void fetchProducts(currentCategoryId, productsOffset, true);
    }
  };

  useEffect(() => {
    // Don't block first paint on the category waterfall — rail + search +
    // skeleton grid paint immediately; the catalog fills in when ready.
    if (kioskSplit) void fetchAllProducts(0, false);
    void fetchCategoryLevel(null);
  }, []);

  // Lazy-load the full catalog once, on the first root-level keystroke. The
  // server response is Redis-cached, so this is a single cheap round trip and
  // every later keystroke filters in memory. Kiosk-split first-page paint
  // flips showAllProducts — that must not disable this path.
  const isAtRootLevel = isCatalogRootSearchLevel({
    currentCategoryId,
    showAllProducts,
    kioskSplit,
  });
  useEffect(() => {
    if (
      !shouldHydrateRootSearchPool({
        isAtRootLevel,
        search,
        hasPool: Boolean(rootSearchPool),
      })
    ) {
      return;
    }

    let cancelled = false;
    setLoadingRootSearch(true);
    fetch(`${apiBasePath}/ecwid-products?mode=all&limit=100&offset=0`)
      .then((r) => r.json() as Promise<ProductsResponse>)
      .then((payload) => {
        if (cancelled || !payload.success) return;
        setRootSearchPool(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch(() => { /* search degrades to categories-only; never break the step */ })
      .finally(() => { if (!cancelled) setLoadingRootSearch(false); });
    return () => {
      cancelled = true;
    };
  }, [isAtRootLevel, search, rootSearchPool, apiBasePath]);

  // Sync selection + price to parent after state settles (avoids setState-during-render)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Manual "Other" entry is not driven by catalog chips — don't clear it.
    if (selectedItems.length === 0 && selectedProduct?.type === 'Other') {
      return;
    }
    notifyParent(selectedItems);
  }, [selectedItems, selectedProduct?.type]);

  const filteredCategories = categories.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.fullPath.toLowerCase().includes(q);
  });

  // At the root level a query searches the WHOLE catalog (rootSearchPool);
  // inside a category it filters that category's own page, as before.
  const productPool = resolveCatalogProductPool({
    isAtRootLevel,
    search,
    rootSearchPool,
    products,
  });

  const filteredProducts = productPool.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const notifyParent = (items: SelectedItem[]) => {
    const model = items.map((i) => i.name).join(', ');
    onSelect({ type: items.length > 0 ? rootName : '', model, sourceSku: deriveSourceSku(items) });
    onPriceChange?.(totalPriceOf(items).toFixed(2));
  };

  const toggleProduct = (product: EcwidProduct) => {
    setShowOther(false);
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.id === product.id);
      return exists
        ? prev.filter((i) => i.id !== product.id)
        : [...prev, { id: product.id, name: product.name, price: product.price, sku: product.sku }];
    });
  };

  const removeItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleOtherSubmit = () => {
    const value = otherModelText.trim();
    if (!value) return;
    onSelect({ type: 'Other', model: value, sourceSku: null });
    setSelectedItems([]);
    setOtherModelText('');
    setShowOther(false);
  };

  const handleAddAnotherItem = () => {
    onAddAnotherItem?.();
    // Keep cart + category path; focus browse search when returning to / already on browse.
    requestAnimationFrame(() => {
      const host = searchInputHostRef.current;
      const input = host?.querySelector('input');
      input?.focus();
    });
  };

  const isSelected = (id: string) => selectedItems.some((i) => i.id === id);
  const isAtRoot = !currentCategoryId;
  const loading = loadingCategories;

  const goBackOneLevel = () => {
    if (kioskSplit) {
      if (breadcrumbs.length === 0) return;
      void fetchCategoryLevel(
        breadcrumbs.length <= 1 ? null : breadcrumbs[breadcrumbs.length - 2].id,
      );
      return;
    }
    if (showAllProducts) {
      setShowAllProducts(false);
      setProducts([]);
      setProductsOffset(0);
      setHasMoreProducts(false);
      setSearch('');
      return;
    }
    void fetchCategoryLevel(
      breadcrumbs.length <= 1 ? null : breadcrumbs[breadcrumbs.length - 2].id,
    );
  };

  const categoryRowClass = (opts?: { active?: boolean; depth?: number }) =>
    cn(
      pos
        ? cn(
            KIOSK_POS_CATEGORY,
            opts?.active ? KIOSK_POS_CATEGORY_ACTIVE : KIOSK_POS_CATEGORY_IDLE,
          )
        : cn(
            'flex w-full items-center justify-between gap-3 text-left transition-all',
            flush
              ? cn(
                  'bg-surface-card px-4 py-3.5 hover:bg-surface-sunken active:bg-surface-sunken',
                  cornerClass('flush'),
                  opts?.active && 'bg-surface-sunken',
                )
              : 'rounded-xl border border-border-soft bg-surface-card p-3.5 hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100',
          ),
    );

  const renderCategoryChildren = (nested: boolean) => (
    <>
      {filteredCategories.map((cat) => (
        // ds-raw-button: full-width category nav row card (title + chevron), not a Button shape
        <button
          key={cat.id}
          type="button"
          onClick={() => void fetchCategoryLevel(cat.id)}
          className={categoryRowClass({ active: false, depth: nested ? 1 : 0 })}
          style={nested && flush ? { paddingLeft: '32px' } : undefined}
        >
          <span className="truncate text-xs font-semibold text-text-default">
            {cat.name}
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-faint" />
        </button>
      ))}
      {isAtRoot && !kioskSplit && (
        // ds-raw-button: full-width nav row card (title + chevron), not a Button shape
        // Staff stacked only — kiosk-split loads all products on the right stage.
        <button
          type="button"
          onClick={() => void fetchAllProducts()}
          className={categoryRowClass({ active: showAllProducts, depth: nested ? 1 : 0 })}
          style={nested && flush ? { paddingLeft: '32px' } : undefined}
        >
          <span className="truncate text-xs font-semibold text-text-default">
            Pick Your Repair - All Repairs
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-faint" />
        </button>
      )}
    </>
  );

  const renderStackedCategories = () => (
    <div className={flush ? 'gap-0' : 'space-y-1.5'}>
      <p
        className={cn(
          'text-role-eyebrow uppercase tracking-[0.15em] text-text-faint',
          flush && 'border-b border-border-hairline px-4 py-2',
        )}
      >
        {isAtRoot ? 'Categories' : 'Sub-categories'}
      </p>
      <div
        className={cn(
          flush
            ? 'divide-y divide-border-hairline border-b border-border-hairline'
            : 'grid gap-1.5',
        )}
        style={
          flush
            ? undefined
            : { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }
        }
      >
        {renderCategoryChildren(false)}
      </div>
    </div>
  );

  const searchLabel = pos
    ? 'Search'
    : showAllProducts
      ? 'Search all repairs'
      : isAtRoot
        ? 'Search repairs or categories'
        : 'Search products';

  const chromeFindBar = (
    <SearchField
      placeholder={searchLabel}
      value={search}
      onChange={setSearch}
      className="min-w-0 flex-1"
        />
  );

  const renderSearchBar = () => (
      <div
        ref={searchInputHostRef}
        className={cn(
          'flex items-stretch',
          flush
            ? 'gap-0 border-b border-border-hairline bg-surface-sunken'
            : 'items-center gap-2',
        )}
      >
        <IconButton
          type="button"
          onClick={goBackOneLevel}
          disabled={loading || (isAtRoot && !showAllProducts)}
          className={cn(
            flush
              ? cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center border-r border-border-hairline',
                  'bg-surface-card transition-colors hover:bg-surface-sunken',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  cornerClass('flush'),
                )
              : 'flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-border-soft bg-surface-canvas transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40',
          )}
          ariaLabel="Go back"
          icon={<ChevronLeft className="h-4 w-4" />}
        />
        {chromeFindBar}
      </div>
  );

  const renderProductsGrid = () => (
    <>
      {(loadingProducts || loadingRootSearch || filteredProducts.length > 0) && (
        <div
          className={cn(pos ? 'gap-0' : flush ? 'gap-0' : 'space-y-2')}
          data-kiosk-product-browse
        >
          {!pos && (
            <p
              className={cn(
                'text-role-eyebrow uppercase tracking-[0.15em] text-text-faint',
                flush && 'border-b border-border-hairline px-4 py-2',
              )}
            >
              {loadingProducts || loadingRootSearch
                ? filteredProducts.length > 0
                  ? 'Updating products…'
                  : 'Loading products...'
                : 'Products'}
            </p>
          )}
          {pos &&
            (loadingProducts || loadingRootSearch) &&
            filteredProducts.length === 0 && (
              <div
                className={KIOSK_POS_GRID}
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
                aria-busy="true"
                aria-label="Loading products"
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className={KIOSK_POS_CARD} aria-hidden>
                    <div className={KIOSK_POS_IMAGE_WELL} />
                    <div className={KIOSK_POS_CARD_CAPTION}>
                      <div className="h-4 w-3/4 bg-surface-sunken" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          {/* Keep the prior grid mounted while a fetch is in flight — never blank the stage. */}
          {filteredProducts.length > 0 && (
            <div
              className={cn(
                pos
                  ? KIOSK_POS_GRID
                  : flush
                    ? 'grid gap-0 border-b border-border-hairline'
                    : 'grid gap-2',
                (loadingProducts || loadingRootSearch) && 'opacity-90',
              )}
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              }}
            >
              {filteredProducts.map((product) => {
                const selected = isSelected(product.id);
                return (
                  // ds-raw-button: selectable product image+price card with checkmark overlay, not a Button shape
                  <button
                    key={product.id}
                    type="button"
                    data-testid="product-tile"
                    onClick={() => toggleProduct(product)}
                    className={
                      pos
                        ? cn(KIOSK_POS_CARD, selected && KIOSK_POS_CARD_SELECTED)
                        : cn(
                            'relative flex flex-col overflow-hidden text-left transition-all',
                            flush
                              ? cn(
                                  'border border-border-hairline',
                                  cornerClass('flush'),
                                  selected
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'hover:bg-surface-sunken',
                                )
                              : cn(
                                  'rounded-xl border-2',
                                  selected
                                    ? 'border-blue-500 shadow-md shadow-blue-500/20'
                                    : 'border-border-soft hover:border-blue-300 hover:shadow-sm',
                                ),
                          )
                    }
                  >
                    <div
                      className={
                        pos
                          ? KIOSK_POS_IMAGE_WELL
                          : 'relative aspect-square w-full flex-shrink-0 overflow-hidden bg-surface-sunken'
                      }
                    >
                      {product.thumbnailUrl ? (
                        <img
                          src={product.thumbnailUrl}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          width={400}
                          height={400}
                        />
                      ) : (
                        <div
                          className={cn(
                            'flex h-full w-full items-center justify-center uppercase tracking-widest',
                            KIOSK_META,
                            'text-text-faint',
                          )}
                        >
                          No Image
                        </div>
                      )}

                      {/* Kiosk POS: circular pick indicator, top-left of the cell. */}
                      {pos && (
                        <span
                          className={cn(
                            KIOSK_POS_CARD_SELECT_DOT,
                            selected
                              ? KIOSK_POS_CARD_SELECT_DOT_ON
                              : KIOSK_POS_CARD_SELECT_DOT_OFF,
                          )}
                          aria-hidden
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                      {selected && !pos && (
                        <div
                          className={cn(
                            'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center bg-blue-600',
                            flush ? cornerClass('flush') : 'rounded-full',
                          )}
                        >
                          <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {pos ? (
                      <div className={KIOSK_POS_CARD_CAPTION}>
                        <p className={KIOSK_TILE_TITLE}>{product.name}</p>
                        <div className="flex items-end justify-between gap-1">
                          <span
                            className={cn(
                              'text-sm font-semibold',
                              product.price !== null ? 'text-emerald-600' : 'text-text-faint',
                            )}
                          >
                            {product.price !== null ? `$${product.price.toFixed(2)}` : '--'}
                          </span>
                          {product.sku && (
                            <span className={cn('max-w-[55%] truncate text-right', KIOSK_META)}>
                              {product.sku}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`flex flex-1 flex-col justify-between gap-1.5 p-2.5 ${selected ? 'bg-blue-600' : 'bg-surface-card'}`}>
                        <p className={`text-xs font-semibold leading-tight ${selected ? 'text-white' : 'text-text-default'}`}>
                          {product.name}
                        </p>
                        <div className="flex items-end justify-between gap-1">
                          <span className={`text-sm font-semibold ${
                            selected ? 'text-blue-100' : product.price !== null ? 'text-emerald-600' : 'text-text-faint'
                          }`}>
                            {product.price !== null ? `$${product.price.toFixed(2)}` : '--'}
                          </span>
                          {product.sku && (
                            <span className={`max-w-[55%] truncate text-right text-role-eyebrow font-semibold ${selected ? 'text-blue-200' : 'text-text-faint'}`}>
                              {product.sku}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Last child — full-cell squared frame above image + caption. */}
                    {pos && selected ? (
                      <span className={KIOSK_POS_CARD_SELECTED_FRAME} aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {!loadingProducts && hasMoreProducts && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={loadMoreProducts}
              disabled={loadingMoreProducts}
              className={cn(
                'w-full',
                pos ? 'mt-2' : flush ? cn('mt-0', cornerClass('flush')) : 'mt-2',
              )}
            >
              {loadingMoreProducts ? 'Loading More...' : `Load ${PRODUCT_PAGE_SIZE} More`}
            </Button>
          )}
        </div>
      )}

      {!loadingProducts && filteredCategories.length === 0 && filteredProducts.length === 0 && (
        <div
          className={cn(
            'text-xs font-semibold text-amber-700',
            pos
              ? 'rounded-xl bg-amber-50 px-4 py-3.5'
              : flush
                ? 'border-b border-border-hairline bg-amber-50 px-4 py-3.5'
                : 'rounded-xl border border-amber-200 bg-amber-50 p-4',
          )}
        >
          {search.trim() ? 'No results match your search.' : 'No items found at this level.'}
        </div>
      )}
    </>
  );

  const renderCartTray = (opts?: { withActions?: boolean }) => {
    if (selectedItems.length === 0 && !opts?.withActions) return null;
    // Instrument floor stays flush on POS split and stacked-flush alike.
    const instrument = pos || flush;
    const kioskActions = Boolean(opts?.withActions && instrument);
    return (
      // Selected items tray — StackedRowIdentity (title → SKU keys)
      <div
        className={cn(
          instrument
            ? cn('mt-auto shrink-0', !kioskActions && 'border-t border-border-soft', cornerClass('flush'))
            : 'overflow-hidden rounded-xl bg-blue-600 p-3 shadow-lg shadow-blue-500/20',
        )}
        data-kiosk-cart-tray
      >
        {selectedItems.length > 0 && (
          <div
            className={cn(
              instrument
                ? cn(
                    'divide-y divide-border-hairline border-t border-border-soft bg-surface-card',
                    kioskActions && 'max-h-40 overflow-y-auto',
                  )
                : 'space-y-1.5',
            )}
          >
            {selectedItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  instrument
                    ? 'bg-surface-card px-4 py-2.5'
                    : 'rounded-lg bg-surface-card px-3 py-2',
                )}
              >
                <StackedRowIdentity
                  title={
                    <p className="truncate text-role-micro text-text-default">{item.name}</p>
                  }
                  keys={
                    item.sku ? (
                      <span className="text-role-eyebrow font-semibold text-text-faint">
                        {item.sku}
                      </span>
                    ) : null
                  }
                  trailing={
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {item.price !== null && (
                        <span className="text-role-micro text-emerald-600">
                          ${item.price.toFixed(2)}
                        </span>
                      )}
                      <IconButton
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center bg-surface-sunken transition-colors hover:bg-red-100',
                          instrument ? cornerClass('flush') : 'rounded-md',
                        )}
                        ariaLabel="Remove item"
                        icon={
                          <svg className="h-3 w-3 text-text-soft hover:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        }
                      />
                    </div>
                  }
                />
              </div>
            ))}
          </div>
        )}
        {opts?.withActions && (
          kioskActions ? (
            // One h-14 floor — same seam token as KIOSK_PANE_HEADER_BAND (border-border-soft).
            <div className={KIOSK_PANE_FOOTER_BAND} data-kiosk-footer-band>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleAddAnotherItem}
                className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
                data-kiosk-add-another
              >
                Add another item
              </Button>
              {selectedItems.length > 0 && (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => onContinue?.()}
                  disabled={catalogPhase === 'checkout'}
                  className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
                  data-kiosk-continue
                >
                  Continue
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleAddAnotherItem}
                className="w-full"
                data-kiosk-add-another
              >
                Add another item
              </Button>
              {selectedItems.length > 0 && (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => onContinue?.()}
                  disabled={catalogPhase === 'checkout'}
                  className="w-full"
                  data-kiosk-continue
                >
                  Continue
                </Button>
              )}
            </div>
          )
        )}
      </div>
    );
  };

  const renderManualEntry = () => {
    if (hideManualEntry) return null;
    return (
      <div className={cn(flush ? 'space-y-0 border-b border-border-hairline' : 'space-y-2')}>
        {/* ds-raw-button: full-width selectable toggle card with title + conditional subtitle and active-state restyle — not a Button/IconButton shape */}
        <button
          type="button"
          onClick={() => setShowOther((prev) => !prev)}
          className={cn(
            'w-full text-left transition-all',
            flush
              ? cn(
                  'px-4 py-3.5',
                  cornerClass('flush'),
                  selectedProduct?.type === 'Other'
                    ? 'bg-surface-inverse text-white'
                    : 'border-b border-border-hairline bg-surface-canvas text-text-default hover:bg-surface-sunken',
                )
              : cn(
                  'rounded-xl p-3.5',
                  selectedProduct?.type === 'Other'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'border border-border-soft bg-surface-canvas text-text-default hover:border-blue-300 hover:bg-blue-50',
                ),
          )}
        >
          <div className="text-xs font-semibold uppercase tracking-wide">Other -- Manual Entry</div>
          {selectedProduct?.type === 'Other' && (
            <div className="mt-1 truncate text-role-micro font-semibold opacity-90">{selectedProduct.model}</div>
          )}
        </button>

        {showOther && (
          <div className={cn('flex items-center', flush ? 'gap-0' : 'gap-2')}>
            <TextField
              label="Product name"
              value={otherModelText}
              onChange={setOtherModelText}
              className="flex-1"
              appearance={flush ? 'flush' : 'default'}
              onKeyDown={(e) => { if (e.key === 'Enter') handleOtherSubmit(); }}
            />
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleOtherSubmit}
              disabled={!otherModelText.trim()}
              className={flush ? cornerClass('flush') : undefined}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderStackedBreadcrumbs = () => {
    if (!(breadcrumbs.length > 0 || showAllProducts)) return null;
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 text-role-eyebrow uppercase tracking-wide text-text-soft',
          flush && 'border-b border-border-hairline px-4 py-2',
        )}
      >
        {showAllProducts ? (
          <>
            {/* ds-raw-button: inline breadcrumb text link (no chrome) — Button would add height/padding */}
            <button
              type="button"
              onClick={() => void fetchCategoryLevel(null)}
              className="transition-colors hover:text-blue-600"
            >
              {rootName}
            </button>
            <ChevronRight className="h-3 w-3 flex-shrink-0 text-text-faint" />
            <span className="text-text-default">All Repairs</span>
          </>
        ) : breadcrumbs.map((b, i) => (
          <React.Fragment key={b.id}>
            {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-text-faint" />}
            {/* ds-raw-button: inline breadcrumb text link (no chrome) */}
            <button
              type="button"
              onClick={() => void fetchCategoryLevel(i === 0 ? null : b.id)}
              className={`transition-colors hover:text-blue-600 ${i === breadcrumbs.length - 1 ? 'text-text-default' : ''}`}
            >
              {b.name}
            </button>
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Kiosk: trail (command · All products · cart/paperwork/stance)
  // Callers: KioskShell `/kiosk` + `/kiosk/v2`. Affected API: none.
  // User: "The top header component should not be another header navigation, it
  // should be included in the same row as the all products."
  if (kioskSplit) {
    const canGoBack =
      !(loading && !categoriesHydratedRef.current) && breadcrumbs.length > 0;
    const kioskSearchPlaceholder = isAtRoot
      ? 'Search all products'
      : `Search in ${breadcrumbs[breadcrumbs.length - 1]?.name ?? 'this category'}`;
    const catalogTrail = (
            <div className={cn(KIOSK_PANE_HEADER_BAND, 'gap-2 pl-2 pr-3')} data-testid="kiosk-catalog-trail">
              {sidebarHeader}
              {canGoBack ? (
                <button
                  type="button"
                  aria-label="Go back"
                  disabled={loading}
                  onClick={goBackOneLevel}
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center',
                    HEADER_ICON_CORNER,
                    focusRing('control', 'neutral'),
                    KIOSK_MODE_SPINE_ROW_IDLE,
                  )}
                >
                  <ChevronLeft className={cn(KIOSK_MODE_SPINE_ICON, 'text-text-soft')} />
                </button>
              ) : null}
              <nav
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2 text-sm font-semibold text-text-soft"
                aria-label="Browse path"
              >
                {breadcrumbs.length > 0 ? (
                  <>
                    <button
                      type="button"
                      data-testid="kiosk-catalog-all-products"
                      onClick={() => void fetchCategoryLevel(null)}
                      className="ds-raw-button shrink-0 px-2 py-1 text-left font-medium text-text-faint transition-colors hover:text-text-accent"
                    >
                      All products
                    </button>
                    {breadcrumbs.slice(0, -1).map((crumb) => (
                      <React.Fragment key={crumb.id}>
                        <ChevronRight className="h-3 w-3 shrink-0 text-text-faint" />
                        <button
                          type="button"
                          onClick={() => void fetchCategoryLevel(crumb.id)}
                          className="ds-raw-button shrink-0 px-2 py-1 text-left transition-colors hover:text-text-accent"
                        >
                          {crumb.name}
                        </button>
                      </React.Fragment>
                    ))}
                    <ChevronRight className="h-3 w-3 shrink-0 text-text-faint" />
                  </>
                ) : null}
                <IntakeCombobox
                  testId="kiosk-catalog-category"
                  ariaLabel="Category"
                  triggerVariant="ghost"
                  value={currentCategoryId ?? KIOSK_ALL_PRODUCTS_VALUE}
                  placeholder="All products"
                  searchPlaceholder="Search categories"
                  emptyMessage="No categories match"
                  disabled={loading && !categoriesHydratedRef.current}
                  className={cn('font-medium text-text-default', focusRing('control', 'neutral'))}
                  contentClassName={cn('min-w-72 overflow-hidden', HEADER_ICON_CORNER)}
                  options={[
                    { value: KIOSK_ALL_PRODUCTS_VALUE, label: 'All products' },
                    ...(currentCategoryId && breadcrumbs.length > 0
                      ? [
                          {
                            value: currentCategoryId,
                            label: breadcrumbs[breadcrumbs.length - 1]?.name ?? 'This category',
                          },
                        ]
                      : []),
                    ...filteredCategories
                      .filter((cat) => cat.id !== currentCategoryId)
                      .map((cat) => ({
                        value: cat.id,
                        label: cat.name,
                      })),
                  ]}
                  onChange={(next) => {
                    if (next === KIOSK_ALL_PRODUCTS_VALUE) {
                      void fetchCategoryLevel(null);
                      return;
                    }
                    if (next === currentCategoryId) {
                      goBackOneLevel();
                      return;
                    }
                    void fetchCategoryLevel(next);
                  }}
                />
              </nav>
              {trailEnd}
            </div>
    );
    const browseColumn = (
          <>
            <div
              ref={searchInputHostRef}
              className={KIOSK_BAND_SEARCH_ROW}
              data-testid="kiosk-catalog-search"
            >
              <SearchField
                fillHost
                hideUnderline
                placeholder={kioskSearchPlaceholder}
                value={search}
                onChange={setSearch}
                className="min-w-0 flex-1 px-4"
              />
            </div>
            <div className={KIOSK_POS_BROWSE_SCROLL}>
              {loading && !categoriesHydratedRef.current && (
                <div className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Loading...
                </div>
              )}
              {error && (
                <div className="bg-red-50 px-4 py-3.5 text-xs font-semibold text-red-700">{error}</div>
              )}
              {renderProductsGrid()}
            </div>
            {hideCartTray && selectedItems.length > 0 && onContinue ? (
              <div className={KIOSK_PANE_FOOTER_BAND} data-kiosk-footer-band>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={onContinue}
                  className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
                  data-kiosk-continue
                >
                  {selectedItems.length > 1
                    ? `Continue · ${selectedItems.length} services`
                    : 'Continue'}
                </Button>
              </div>
            ) : null}
          </>
    );
    return (
      <div
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', KIOSK_POS_CANVAS)}
        data-kiosk-catalog-split
      >
        {catalogTrail}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {catalogPhase === 'checkout' && stageContent ? stageContent : browseColumn}
          </div>
        </div>
        {!hideCartTray &&
          (selectedItems.length > 0 || catalogPhase === 'checkout') &&
          renderCartTray({ withActions: true })}
      </div>
    );
  }

  // ─── Stacked (staff / legacy)
  return (
    <div
      className={cn(
        flush
          ? fillHeight
            ? 'flex h-full flex-col gap-0'
            : 'flex flex-col gap-0'
          : fillHeight
            ? 'flex h-full flex-col gap-4'
            : 'space-y-4',
      )}
    >
      {renderSearchBar()}
      {renderManualEntry()}
      {renderStackedBreadcrumbs()}

      {loading && (
        <div
          className={cn(
            'text-xs font-semibold uppercase tracking-wide text-text-faint',
            flush
              ? 'border-b border-border-hairline px-4 py-3.5'
              : 'rounded-xl border border-border-soft bg-surface-canvas p-4',
          )}
        >
          Loading...
        </div>
      )}

      {!loading && error && (
        <div
          className={cn(
            'text-xs font-semibold text-red-700',
            flush
              ? 'border-b border-border-hairline bg-red-50 px-4 py-3.5'
              : 'rounded-xl border border-red-200 bg-red-50 p-4',
          )}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div
          className={cn(
            flush ? 'gap-0' : 'space-y-4 p-0.5',
            flowInPage ? '' : `${fillHeight ? 'flex-1' : 'max-h-[50vh]'} overflow-y-auto`,
          )}
        >
          {!showAllProducts && filteredCategories.length > 0 && renderStackedCategories()}
          {renderProductsGrid()}
        </div>
      )}

      {renderCartTray()}
    </div>
  );
}
