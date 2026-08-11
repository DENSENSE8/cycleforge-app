'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from '../Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { cornerClass } from '@/design-system/tokens/radius';
import { KIOSK_PANE_FOOTER_BAND } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

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
   * `flush` = kiosk V2 edge-to-edge catalog (square chrome, full-bleed rows).
   * Staff intake keeps the soft `default` cards.
   */
  appearance?: 'default' | 'flush';
  /**
   * `stacked` = staff / legacy single column.
   * `kiosk-split` = left category+cart sidebar · right browse (or `stageContent`).
   */
  layout?: 'stacked' | 'kiosk-split';
  /** Browse vs checkout — checkout replaces the products stage with `stageContent`. */
  catalogPhase?: 'browse' | 'checkout';
  /** Continue to checkout when the cart has items (kiosk-split). */
  onContinue?: () => void;
  /** Return to browse without clearing the cart (kiosk-split). */
  onAddAnotherItem?: () => void;
  /** Pane header for the left sidebar (spine toggle + title). */
  sidebarHeader?: React.ReactNode;
  /** Checkout detail pane — mounts in the right stage when phase is checkout. */
  stageContent?: React.ReactNode;
  /** Optional title band for the browse stage (right). */
  browseHeader?: React.ReactNode;
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
/** Cache key for the top category level (`fetchCategoryLevel(null)`). */
const CATEGORY_ROOT_KEY = '__root__';

function categoryLevelKey(parentId: string | null): string {
  return parentId ?? CATEGORY_ROOT_KEY;
}

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
  stageContent,
  browseHeader,
}: ProductSelectorProps) {
  const flush = appearance === 'flush';
  const kioskSplit = layout === 'kiosk-split';
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<EcwidProduct[]>([]);
  const [rootName, setRootName] = useState('Bose Repair Service');
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
  /**
   * Per-parent category rows — kept across drills so selecting a category does
   * not wipe sibling tabs from the sidebar. Key = {@link categoryLevelKey}.
   */
  const [categoryLevelsByParent, setCategoryLevelsByParent] = useState<
    Record<string, CategoryNode[]>
  >({});
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
    // Root clears the browse grid; drills keep prior products until the next
    // product fetch replaces them (no empty flash on the right stage).
    if (!parentId) setProducts([]);

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
      // Merge — never clear other levels; siblings stay mounted in the accordion.
      setCategoryLevelsByParent((prev) => ({
        ...prev,
        [categoryLevelKey(parentId)]: rows,
      }));
      categoriesHydratedRef.current = true;

      if (parentId) void fetchProducts(parentId, 0, false);
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

  useEffect(() => { void fetchCategoryLevel(null); }, []);

  // Lazy-load the full catalog once, on the first root-level keystroke. The
  // server response is Redis-cached, so this is a single cheap round trip and
  // every later keystroke filters in memory.
  const isAtRootLevel = !currentCategoryId && !showAllProducts;
  useEffect(() => {
    if (!isAtRootLevel || search.trim().length < 2) return;
    if (rootSearchPool || loadingRootSearch) return;

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
    return () => { cancelled = true; };
  }, [isAtRootLevel, search, rootSearchPool, loadingRootSearch, apiBasePath]);

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
  const productPool =
    isAtRootLevel && search.trim().length >= 2 && rootSearchPool ? rootSearchPool : products;

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
      'flex w-full items-center justify-between gap-3 text-left transition-all',
      flush
        ? cn(
            'bg-surface-card px-4 py-3.5 hover:bg-surface-sunken active:bg-surface-sunken',
            cornerClass('flush'),
            opts?.active && 'bg-surface-sunken',
          )
        : 'rounded-xl border border-border-soft bg-surface-card p-3.5 hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100',
    );

  const filterLevelCategories = (rows: CategoryNode[]) => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (c) => c.name.toLowerCase().includes(q) || c.fullPath.toLowerCase().includes(q),
    );
  };

  /** Ids on the current trail — used to keep sibling tabs visible under expansion. */
  const pathIdSet = new Set(breadcrumbs.map((b) => b.id));
  if (currentCategoryId) pathIdSet.add(currentCategoryId);

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
      {isAtRoot && (
        // ds-raw-button: full-width nav row card (title + chevron), not a Button shape
        <button
          type="button"
          onClick={() => void fetchAllProducts()}
          className={cn(
            categoryRowClass({ active: showAllProducts, depth: nested ? 1 : 0 }),
            flush && !showAllProducts && 'bg-surface-sunken hover:bg-blue-50 active:bg-blue-50',
          )}
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

  /**
   * Nested sibling level for the kiosk accordion. Selecting one category expands
   * its children underneath — siblings at this level stay mounted (never removed).
   */
  const renderAccordionSiblingLevel = (parentKey: string, depth: number): React.ReactNode => {
    const siblings = filterLevelCategories(categoryLevelsByParent[parentKey] ?? []);
    if (siblings.length === 0 && !(parentKey === CATEGORY_ROOT_KEY && depth === 0)) {
      return null;
    }

    return (
      <div
        className={cn(
          'divide-y divide-border-hairline',
          depth > 0 && 'border-t border-border-hairline bg-surface-sunken/40',
        )}
      >
        {siblings.map((cat) => {
          const onPath = pathIdSet.has(cat.id);
          const isCurrent = currentCategoryId === cat.id;
          const childKey = cat.id;
          const hasCachedChildren = (categoryLevelsByParent[childKey]?.length ?? 0) > 0;
          return (
            <div key={cat.id}>
              {/* ds-raw-button: accordion sibling tab — stays visible when another sibling is selected */}
              <button
                type="button"
                onClick={() => void fetchCategoryLevel(cat.id)}
                className={categoryRowClass({ active: onPath || isCurrent })}
                style={depth > 0 ? { paddingLeft: `${16 + depth * 12}px` } : undefined}
              >
                <span className="truncate text-xs font-semibold text-text-default">
                  {cat.name}
                </span>
                {(onPath || hasCachedChildren) && (
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 flex-shrink-0 text-text-faint',
                      onPath && 'rotate-90',
                    )}
                  />
                )}
                {!onPath && !hasCachedChildren && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-faint" />
                )}
              </button>
              {onPath && renderAccordionSiblingLevel(childKey, depth + 1)}
            </div>
          );
        })}
        {parentKey === CATEGORY_ROOT_KEY && depth === 0 && (
          // ds-raw-button: All Repairs stays a peer tab of root siblings
          <button
            type="button"
            onClick={() => void fetchAllProducts()}
            className={cn(
              categoryRowClass({ active: showAllProducts }),
              flush && !showAllProducts && 'bg-surface-sunken hover:bg-blue-50 active:bg-blue-50',
            )}
          >
            <span className="truncate text-xs font-semibold text-text-default">
              Pick Your Repair - All Repairs
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-faint" />
          </button>
        )}
      </div>
    );
  };

  /** Path accordion — selected trail expands; sibling tabs at each level stay visible. */
  const renderCategoryAccordion = () => (
    <div className="gap-0" data-kiosk-catalog-sidebar>
      <p
        className={cn(
          'text-role-eyebrow uppercase tracking-[0.15em] text-text-faint',
          flush && 'border-b border-border-hairline px-4 py-2',
        )}
      >
        Categories
      </p>
      <div className="divide-y divide-border-hairline border-b border-border-hairline">
        {/* Root always visible — tap resets to top level; does not clear the sibling cache */}
        {/* ds-raw-button: accordion ancestor row */}
        <button
          type="button"
          onClick={() => void fetchCategoryLevel(null)}
          className={categoryRowClass({
            active: isAtRoot && !showAllProducts,
          })}
        >
          <span className="truncate text-xs font-semibold text-text-default">{rootName}</span>
          {(breadcrumbs.length > 1 || Object.keys(categoryLevelsByParent).length > 0) && (
            <ChevronRight className="h-4 w-4 flex-shrink-0 rotate-90 text-text-faint" />
          )}
        </button>

        {/* Sibling tabs always stay mounted — selection expands under the active row. */}
        {renderAccordionSiblingLevel(CATEGORY_ROOT_KEY, 0)}
      </div>
    </div>
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
      {!kioskSplit && (
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
      )}
      <TextField
        label={showAllProducts ? 'Search all repairs' : isAtRoot ? 'Search repairs or categories' : 'Search products'}
        value={search}
        onChange={setSearch}
        className="flex-1"
        tone="blue"
        appearance={flush ? 'flush' : 'default'}
      />
    </div>
  );

  const renderProductsGrid = () => (
    <>
      {(loadingProducts || loadingRootSearch || filteredProducts.length > 0) && (
        <div className={flush ? 'gap-0' : 'space-y-2'} data-kiosk-product-browse>
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
          {/* Keep the prior grid mounted while a fetch is in flight — never blank the stage. */}
          {filteredProducts.length > 0 && (
            <div
              className={cn(
                flush ? 'grid gap-0 border-b border-border-hairline' : 'grid gap-2',
                (loadingProducts || loadingRootSearch) && 'opacity-70',
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
                    onClick={() => toggleProduct(product)}
                    className={cn(
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
                    )}
                  >
                    <div className="relative aspect-square w-full flex-shrink-0 overflow-hidden bg-surface-sunken">
                      {product.thumbnailUrl ? (
                        <img
                          src={product.thumbnailUrl}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-role-eyebrow uppercase tracking-widest text-text-faint">
                          No Image
                        </div>
                      )}

                      {selected && (
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
              className={cn('w-full', flush ? cn('mt-0', cornerClass('flush')) : 'mt-2')}
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
            flush
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
    const kioskActions = Boolean(opts?.withActions && flush);
    return (
      // Selected items tray — StackedRowIdentity (title → SKU keys)
      <div
        className={cn(
          flush
            ? cn('mt-auto shrink-0', !kioskActions && 'border-t border-border-soft', cornerClass('flush'))
            : 'overflow-hidden rounded-xl bg-blue-600 p-3 shadow-lg shadow-blue-500/20',
        )}
        data-kiosk-cart-tray
      >
        {selectedItems.length > 0 && (
          <div
            className={cn(
              flush
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
                  flush
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
                          flush ? cornerClass('flush') : 'rounded-md',
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
              tone="blue"
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

  // ─── Kiosk split: left sidebar (categories + cart) · right stage (browse | checkout)
  if (kioskSplit) {
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row"
        data-kiosk-catalog-split
      >
        <aside
          className={cn(
            'flex min-h-0 flex-col border-border-soft bg-surface-card',
            'max-h-[40vh] w-full border-b md:max-h-none md:w-1/3 md:min-w-80 md:max-w-md md:border-b-0 md:border-r',
          )}
        >
          {sidebarHeader}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Categories always stay on screen — cart/footer may not eat the whole column. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-0 [min-height:9rem]">
              {/* Cold start only — never replace a hydrated accordion with Loading… */}
              {loading && !categoriesHydratedRef.current && (
                <div className="border-b border-border-hairline px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Loading...
                </div>
              )}
              {error && (
                <div className="border-b border-border-hairline bg-red-50 px-4 py-3.5 text-xs font-semibold text-red-700">
                  {error}
                </div>
              )}
              {(categoriesHydratedRef.current || !loading) && !error && renderCategoryAccordion()}
            </div>
            {(selectedItems.length > 0 || catalogPhase === 'checkout') &&
              renderCartTray({ withActions: true })}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
          {catalogPhase === 'checkout' && stageContent ? (
            stageContent
          ) : (
            <>
              {browseHeader}
              <div className="min-h-0 flex-1 overflow-y-auto p-0">
                {renderSearchBar()}
                {renderProductsGrid()}
              </div>
            </>
          )}
        </div>
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
