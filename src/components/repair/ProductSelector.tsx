'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Star } from '../Icons';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { SearchField } from '@/design-system/primitives/SearchField';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { cornerClass, DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  KIOSK_META,
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_TILE_TITLE,
} from '@/app/kiosk/kiosk-chrome';
import {
  KIOSK_POS_CTA,
  KIOSK_POS_ACTION_BAR,
  KIOSK_POS_TOP_DOCK,
  KIOSK_POS_TOP_DOCK_INTERACTIVE,
  KIOSK_POS_BROWSE_SCROLL_TOP_CLEARANCE,
  KIOSK_POS_BROWSE_SCROLL,
  KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE,
  KIOSK_POS_CANVAS,
  KIOSK_POS_CARD,
  KIOSK_POS_CARD_CAPTION,
  KIOSK_POS_CARD_SELECTED,
  KIOSK_POS_CARD_SELECTED_FRAME,
  KIOSK_POS_CARD_SELECT_DOT,
  KIOSK_POS_CARD_SELECT_DOT_ON,
  KIOSK_POS_CATEGORY,
  KIOSK_POS_CATEGORY_ACTIVE,
  KIOSK_POS_CATEGORY_IDLE,
  KIOSK_EAGER_TILE_COUNT,
  KIOSK_POS_GRID,
  KIOSK_POS_IMAGE_WELL,
  KIOSK_POS_CARD_CELL,
  KIOSK_POS_CARD_FAVORITE_PIP,
  KIOSK_POS_CARD_FAVORITE_PIP_OFF,
  KIOSK_POS_CARD_FAVORITE_PIP_ON,
  KIOSK_POS_TRAIL_BAND,
  KIOSK_POS_TRAIL_CONTROL,
  KIOSK_POS_TRAIL_ICON,
} from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import {
  isCatalogRootSearchLevel,
  resolveCatalogProductPool,
  shouldHydrateRootSearchPool,
} from './catalog-search-pool';
import {
  isSearchableCatalogQuery,
  resolveStockState,
  stockBadgeLabel,
  type CatalogAvailability,
} from '@/lib/kiosk/catalog-search-pure';
import {
  buildFavoriteSkuKeySet,
  isFavoriteSku,
  type FavoriteWorkspaceKey,
} from '@/lib/favorites/favorite-sku-key';

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
  /** Hides the "Other -- Manual Entry" free-text escape hatch. */
  hideManualEntry?: boolean;
  /**
   * Kiosk/manual intake host for a product that is not in the catalog. When
   * present, the kiosk trail exposes the escape hatch at the top-right and
   * hands the typed title to the owning workflow instead of pretending it is
   * a catalog selection.
   */
  onManualItemAdd?: (title: string) => void;
  /** Let the results flow in the page instead of scrolling inside a capped region. */
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
  /** Override the kiosk CTA's copy. */
  continueLabel?: string;
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
  /**
   * Hide the left-rail cart tray (v2 shell owns a persistent right ledger).
   * Default false so staff stacked + legacy split keep the tray.
   */
  hideCartTray?: boolean;
  /** Where a find-bar query is answered. */
  catalogSearchMode?: 'client' | 'server';
  /** Mount the FAVORITES scope: */
  favoritesWorkspace?: FavoriteWorkspaceKey;
  /** COUNT mode (Sales, Square "Consolidate identical items"): */
  countPicks?: {
    quantities: ReadonlyMap<string, number>;
    onTap: (item: SelectedItem) => void;
  };
  /**
   * Whether the kiosk continue key shows. Defaults to "the picker has a
   * selection"; a count-mode host passes its own cart state, since its picks
   * never enter the picker's selection.
   */
  continueVisible?: boolean;
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
  /**
   * On-hand + bin location, joined server-side. Present only on routes that
   * answer through `searchKioskCatalog`; absent elsewhere, and the card simply
   * omits the line rather than claiming "out of stock".
   */
  availability?: CatalogAvailability | null;
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

/**
 * Rows per catalog page. 24 fills the kiosk grid on a landscape iPad without a
 * scroll; the old 10 made "Load 10 more" the primary way to see the catalog.
 */
const PRODUCT_PAGE_SIZE = 24;
/** Keystroke settle before a server search fires. */
const CATALOG_SEARCH_DEBOUNCE_MS = 180;
/** Combobox sentinel — not an Ecwid id. Clears the category filter. */
const KIOSK_ALL_PRODUCTS_VALUE = 'all-products';
/** Combobox sentinel — the curated list, `?mode=favorites`, not a category. */
const KIOSK_FAVORITES_VALUE = 'favorites';

/** The availability line on a product card — "12 in stock" over "Z1-A-03 +1". */
function ProductAvailabilityLine({
  availability,
  muted,
}: {
  availability: CatalogAvailability | null | undefined;
  muted: boolean;
}) {
  if (!availability) return null;
  const label = stockBadgeLabel(availability);
  if (label == null) return null;
  const state = resolveStockState(availability);
  const bin = availability.bin;
  const extraBins = availability.binCount - 1;
  return (
    // Stacked, not side-by-side: at the 148px card floor two labels on one row
    // truncate each other into "9 in sto…" / "G010120…", which answers neither
    // question. Vertical space on a tall card is the cheap axis.
    <div className="flex flex-col leading-tight">
      <span
        className={cn(
          'truncate text-role-eyebrow font-semibold',
          muted
            ? 'text-blue-200'
            : state === 'out'
              ? 'text-rose-600'
              : state === 'low'
                ? 'text-amber-600'
                : 'text-emerald-600',
        )}
      >
        {label}
      </span>
      {bin ? (
        <span
          className={cn(
            'truncate text-role-eyebrow font-semibold tabular-nums',
            muted ? 'text-blue-200' : 'text-text-faint',
          )}
          title={extraBins > 0 ? `${availability.binCount} bins hold this SKU` : undefined}
        >
          {bin.label}
          {extraBins > 0 ? ` +${extraBins}` : ''}
        </span>
      ) : null}
    </div>
  );
}

export function ProductSelector({
  onSelect, selectedProduct, onPriceChange, fillHeight,
  selectedItems: controlledItems, onSelectedItemsChange,
  apiBasePath = '/api/repair', hideManualEntry = false, flowInPage = false,
  onManualItemAdd,
  appearance = 'default',
  layout = 'stacked',
  catalogPhase = 'browse',
  onContinue,
  continueLabel,
  onAddAnotherItem,
  sidebarHeader,
  trailEnd = null,
  stageContent,
  browseHeader: _browseHeader,
  searchQuery,
  onSearchQueryChange,
  hideCartTray = false,
  catalogSearchMode = 'client',
  favoritesWorkspace,
  countPicks,
  continueVisible,
}: ProductSelectorProps) {
  const kioskSplit = layout === 'kiosk-split';
  /** Flush POS chrome — only the kiosk-split catalog path. */
  const pos = kioskSplit;
  /** Stacked flush chrome — staff/legacy; never when POS split is active. */
  const flush = appearance === 'flush' && !pos;
  /** Favorites scope + tile pip are mounted only when a rail names its list. */
  const favoritesEnabled = Boolean(favoritesWorkspace);
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

  // Kiosk-split: the find bar is a COLLAPSED glyph riding the trail's lead, right of the command dropdown, that expands in place (the…
  const [searchOpen, setSearchOpen] = useState(false);
  const openCatalogSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputHostRef.current?.querySelector('input')?.focus();
    });
  };
  /** Closing also clears the query — a live query behind a closed field is a
   * filtered grid whose reason the operator cannot see. */
  const closeCatalogSearch = () => {
    setSearchOpen(false);
    setSearch('');
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
  /** Favorites scope — the curated list is painting the grid. */
  const [showFavorites, setShowFavorites] = useState(false);
  /** Workspace membership as normalized SKU keys — what each tile pip reads. */
  const [favoriteKeys, setFavoriteKeys] = useState<ReadonlySet<string>>(() => new Set<string>());
  /** SKU whose pip is mid-flight; its own tile is the only one disabled. */
  const [pendingFavoriteSku, setPendingFavoriteSku] = useState<string | null>(null);
  /** PIN MODE — the "Add favorite" tile's job. */
  const [pinning, setPinning] = useState(false);
  const [productsOffset, setProductsOffset] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  // Whole-catalog pool, lazily loaded the first time someone types at the root level.
  const [rootSearchPool, setRootSearchPool] = useState<EcwidProduct[] | null>(null);
  const [loadingRootSearch, setLoadingRootSearch] = useState(false);
  const searchInputHostRef = useRef<HTMLDivElement | null>(null);
  /** After first category hydrate, never swap the sidebar for a Loading… block. */
  const categoriesHydratedRef = useRef(false);
  /** Ignore stale category responses when the operator drills faster than the network. */
  const categoryFetchGen = useRef(0);
  /** Ignore stale search responses when the operator types faster than the network. */
  const searchFetchGen = useRef(0);
  // ── Server-side catalog search ────────────────────────────────────────────
  const serverSearch = catalogSearchMode === 'server';
  const searchable = isSearchableCatalogQuery(search);
  /** True while a server query — not a category drill — is painting the grid. */
  const searchDroveGridRef = useRef(false);

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
    // A cold mount ALSO calls this (to load the root category level) while the favorites landing is in flight, and must not cancel it.
    if (parentId || categoriesHydratedRef.current) setShowFavorites(false);
    setProductsOffset(0);
    setHasMoreProducts(false);
    setSearch('');
    // Root clears the browse grid on staff stacked; kiosk-split keeps the prior
    // grid until fetchAllProducts replaces it (no empty flash on the right stage).
    if (!parentId && !kioskSplit) setProducts([]);

    try {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const response = await kioskFetchHealed(`${apiBasePath}/ecwid-categories${query}`);
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
      const response = await kioskFetchHealed(
        `${apiBasePath}/ecwid-products?categoryId=${encodeURIComponent(categoryId)}&limit=${PRODUCT_PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await response.json()) as ProductsResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to load products');
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setShowFavorites(false);
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
      const response = await kioskFetchHealed(`${apiBasePath}/ecwid-products?mode=all&limit=${PRODUCT_PAGE_SIZE}&offset=${offset}`);
      const payload = (await response.json()) as ProductsResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to load products');
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setProducts((prev) => (append ? [...prev, ...rows] : rows));
      setShowAllProducts(true);
      setShowFavorites(false);
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

  /** The rail's curated list, as ordinary catalog tiles. */
  const fetchFavoriteProducts = async (offset = 0, append = false) => {
    if (append) setLoadingMoreProducts(true);
    else setLoadingProducts(true);
    setError(null);
    if (!append) setSearch('');
    try {
      const response = await kioskFetchHealed(
        `${apiBasePath}/ecwid-products?mode=favorites&limit=${PRODUCT_PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await response.json()) as ProductsResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load favorites');
      }
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setProducts((prev) => (append ? [...prev, ...rows] : rows));
      setShowFavorites(true);
      setPinning(false);
      setShowAllProducts(false);
      setProductsOffset(offset + rows.length);
      setHasMoreProducts(Boolean(payload.hasMore));
    } catch (err) {
      if (!append) {
        setProducts([]);
        setError(err instanceof Error ? err.message : 'Failed to load favorites');
      }
      setHasMoreProducts(false);
    } finally {
      if (append) setLoadingMoreProducts(false);
      else setLoadingProducts(false);
    }
  };

  /** Membership + landing, in one round trip on mount. */
  const hydrateFavorites = async () => {
    let keys: string[] = [];
    try {
      const response = await kioskFetchHealed(`${apiBasePath}/favorites`);
      const payload = (await response.json()) as { skus?: string[] };
      if (response.ok && Array.isArray(payload?.skus)) keys = payload.skus;
    } catch {
      /* Favorites degrade to All products — never break the product step. */
    }
    setFavoriteKeys(buildFavoriteSkuKeySet(keys));
    if (keys.length > 0) await fetchFavoriteProducts(0, false);
    else if (kioskSplit) await fetchAllProducts(0, false);
  };

  /**
   * Star / unstar the SKU on this tile. The response carries the rail's whole
   * membership, so the set is replaced by the server's answer rather than
   * patched from a guess — two tablets on one counter stay in agreement.
   */
  const toggleFavorite = async (product: EcwidProduct) => {
    if (!favoritesEnabled) return;
    const sku = String(product.sku || '').trim();
    if (!sku || pendingFavoriteSku) return;

    const nextFavorite = !isFavoriteSku(favoriteKeys, sku);
    setPendingFavoriteSku(sku);
    try {
      const response = await kioskFetchHealed(`${apiBasePath}/favorites`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, favorite: nextFavorite, label: product.name }),
      });
      const payload = (await response.json()) as { skus?: string[]; error?: string };
      if (!response.ok || !Array.isArray(payload?.skus)) {
        throw new Error(payload?.error || 'Failed to update favorite');
      }
      setFavoriteKeys(buildFavoriteSkuKeySet(payload.skus));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update favorite');
    } finally {
      setPendingFavoriteSku(null);
    }
  };

  /** The "Add favorite" tile: open the whole catalog with taps pinning. */
  const startPinning = () => {
    setPinning(true);
    void fetchAllProducts(0, false);
  };

  /** Whole-catalog server search. */
  const fetchSearchProducts = async (query: string, offset = 0, append = false) => {
    const gen = ++searchFetchGen.current;
    if (append) setLoadingMoreProducts(true);
    else setLoadingRootSearch(true);
    setError(null);
    try {
      const response = await kioskFetchHealed(
        `${apiBasePath}/ecwid-products?q=${encodeURIComponent(query)}&limit=${PRODUCT_PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await response.json()) as ProductsResponse;
      if (gen !== searchFetchGen.current) return;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to search products');
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setProducts((prev) => (append ? [...prev, ...rows] : rows));
      setProductsOffset(offset + rows.length);
      setHasMoreProducts(Boolean(payload.hasMore));
    } catch (err) {
      if (gen !== searchFetchGen.current) return;
      if (!append) {
        setProducts([]);
        setError(err instanceof Error ? err.message : 'Failed to search products');
      }
      setHasMoreProducts(false);
    } finally {
      if (gen === searchFetchGen.current) {
        if (append) setLoadingMoreProducts(false);
        else setLoadingRootSearch(false);
      }
    }
  };

  const loadMoreProducts = () => {
    if (loadingProducts || loadingMoreProducts || !hasMoreProducts) return;
    // A server search owns the grid while it is active — page the QUERY, not
    // the category the operator happened to be in when they started typing.
    if (serverSearch && searchable) {
      void fetchSearchProducts(search, productsOffset, true);
      return;
    }
    if (showFavorites) {
      void fetchFavoriteProducts(productsOffset, true);
      return;
    }
    if (showAllProducts) {
      void fetchAllProducts(productsOffset, true);
      return;
    }
    if (currentCategoryId) {
      void fetchProducts(currentCategoryId, productsOffset, true);
    }
  };

  useEffect(() => {
    // Don't block first paint on the category waterfall — rail + search + skeleton grid paint immediately; the catalog fills in when ready.
    if (favoritesEnabled) void hydrateFavorites();
    else if (kioskSplit) void fetchAllProducts(0, false);
    void fetchCategoryLevel(null);
  }, []);

  // Lazy-load the full catalog once, on the first root-level keystroke.
  const isAtRootLevel = isCatalogRootSearchLevel({
    currentCategoryId,
    showAllProducts: showAllProducts || showFavorites,
    kioskSplit,
  });
  useEffect(() => {
    // Server mode answers the query in SQL; the in-memory pool is the
    // client-mode path only, and hydrating it would fetch 100 rows nobody reads.
    if (
      serverSearch ||
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
    kioskFetchHealed(`${apiBasePath}/ecwid-products?mode=all&limit=100&offset=0`)
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
  }, [isAtRootLevel, search, rootSearchPool, apiBasePath, serverSearch]);

  useEffect(() => {
    if (!serverSearch) return;

    if (!searchable) {
      // Query cleared. Only re-fetch if a search was actually driving the grid,
      // otherwise every keystroke under the floor would refetch the browse page.
      if (!searchDroveGridRef.current) return;
      searchDroveGridRef.current = false;
      searchFetchGen.current += 1;
      if (currentCategoryId) void fetchProducts(currentCategoryId, 0, false);
      // Back to the scope the operator was in, favorites included — a cleared
      // query must not silently promote them to the whole catalog.
      else if (showFavorites) void fetchFavoriteProducts(0, false);
      else void fetchAllProducts(0, false);
      return;
    }

    const handle = setTimeout(() => {
      searchDroveGridRef.current = true;
      void fetchSearchProducts(search, 0, false);
    }, CATALOG_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchers are stable per render; re-running on their identity would refetch every keystroke
  }, [serverSearch, searchable, search, currentCategoryId]);

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

  // Server mode is already filtered AND ranked by SQL. Re-filtering here would
  // drop the rows the trigram arm matched on a typo — the whole point of it.
  const filteredProducts = serverSearch
    ? products
    : productPool.filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      });

  /** Report the selection to the host. */
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
    if (onManualItemAdd) {
      onManualItemAdd(value);
      setShowOther(false);
      setOtherModelText('');
      return;
    }
    onSelect({ type: 'Other', model: value, sourceSku: null });
    setSelectedItems([]);
    setOtherModelText('');
  };

  const handleAddAnotherItem = () => {
    onAddAnotherItem?.();
    // Keep cart + category path; the browse find-bar opens focused on return
    // (opens the collapsed kiosk glyph; focuses the stacked staff row).
    openCatalogSearch();
  };

  /** Units of this product on the host's cart (count mode), else 1/0 for a selection. */
  const pickedCount = (id: string): number =>
    countPicks
      ? (countPicks.quantities.get(id) ?? 0)
      : selectedItems.some((i) => i.id === id)
        ? 1
        : 0;

  const tapProduct = (product: EcwidProduct) => {
    if (!countPicks) {
      toggleProduct(product);
      return;
    }
    setShowOther(false);
    countPicks.onTap({ id: product.id, name: product.name, price: product.price, sku: product.sku });
  };
  const isAtRoot = !currentCategoryId;
  const loading = loadingCategories;
  const manualSelectedItems = selectedItems.filter((item) => item.id.startsWith('manual:'));

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
          'text-role-eyebrow text-text-faint',
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

  /** One chrome for the grid's advisory notices — no results, nothing pinned. */
  const gridNoticeClass = cn(
    'text-xs font-semibold text-amber-700',
    pos
      ? cn(cornerClass('flush'), 'bg-amber-50 px-4 py-3.5')
      : flush
        ? 'border-b border-border-hairline bg-amber-50 px-4 py-3.5'
        : 'rounded-xl border border-amber-200 bg-amber-50 p-4',
  );

  /** The "Add favorite" tile closes the Favorites grid — the last rectangle in the same card shape as every pinned product, so curating the… */
  const showAddFavoriteTile =
    pos && favoritesEnabled && showFavorites && !pinning && search.trim() === '';

  const renderProductsGrid = () => (
    <>
      {pos && pinning ? (
        <div
          className="flex items-center justify-between gap-3 bg-surface-accent px-4 py-2.5"
          data-testid="catalog-pinning-notice"
        >
          <p className="min-w-0 text-sm font-semibold text-text-default">
            Tap a product to add it to Favorites. Tap again to remove it.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => void fetchFavoriteProducts(0, false)}
            data-testid="catalog-pinning-done"
          >
            Done
          </Button>
        </div>
      ) : null}
      {(loadingProducts ||
        loadingRootSearch ||
        filteredProducts.length > 0 ||
        showAddFavoriteTile) && (
        <div
          className={cn(pos ? 'gap-0' : flush ? 'gap-0' : 'space-y-2')}
          data-kiosk-product-browse
        >
          {!pos && (
            <p
              className={cn(
                'text-role-eyebrow text-text-faint',
                flush && 'border-b border-border-hairline px-4 py-2',
              )}
            >
              {loadingProducts || loadingRootSearch
                ? filteredProducts.length > 0
                  ? 'Updating products…'
                  : 'Loading products...'
                : showFavorites
                  ? 'Favorites'
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
          {(filteredProducts.length > 0 || showAddFavoriteTile) && (
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
              {filteredProducts.map((product, index) => {
                const picked = pickedCount(product.id);
                const selected = picked > 0;
                /* LCP is a catalog tile photo, and Lighthouse measured its resource-load DELAY at 4.2s: */
                const aboveFold = index < KIOSK_EAGER_TILE_COUNT;
                const favorited = isFavoriteSku(favoriteKeys, product.sku);
                return (
                  // The CELL, not the card, is the grid child: the card is a
                  // <button> (tap = pick), so the favorite pip cannot nest
                  // inside it and rides the cell's corner instead.
                  <div key={product.id} className={pos ? KIOSK_POS_CARD_CELL : 'relative h-full'}>
                  {/* ds-raw-button: selectable product image+price card with checkmark overlay, not a Button shape */}
                  <button
                    type="button"
                    data-testid="product-tile"
                    aria-pressed={pinning ? favorited : undefined}
                    aria-label={
                      !pinning && picked > 1 ? `${product.name}, ${picked} in cart` : undefined
                    }
                    onClick={() => (pinning ? void toggleFavorite(product) : tapProduct(product))}
                    className={
                      pos
                        ? cn(KIOSK_POS_CARD, 'h-full', selected && KIOSK_POS_CARD_SELECTED)
                        : cn(
                            'relative flex h-full flex-col overflow-hidden text-left transition-all',
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
                          loading={aboveFold ? 'eager' : 'lazy'}
                          fetchPriority={aboveFold ? 'high' : undefined}
                          decoding={aboveFold ? 'sync' : 'async'}
                          width={400}
                          height={400}
                        />
                      ) : (
                        <div
                          className={cn(
                            'flex h-full w-full items-center justify-center',
                            KIOSK_META,
                            'text-text-faint',
                          )}
                        >
                          No Image
                        </div>
                      )}

                      {/* Kiosk POS pick indicator — ONLY once picked. */}
                      {pos && selected && (
                        <span
                          className={cn(
                            KIOSK_POS_CARD_SELECT_DOT,
                            KIOSK_POS_CARD_SELECT_DOT_ON,
                            // `×12` outgrows the 24px disc; it becomes a pill.
                            picked > 1 && 'w-auto min-w-6 px-1.5',
                          )}
                          aria-hidden
                          data-testid="product-tile-count"
                        >
                          {picked > 1 ? (
                            // Count mode: the units on the cart, in place of the check.
                            <span className="text-xs font-bold tabular-nums">×{picked}</span>
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      )}
                      {selected && !pos && (
                        // Top-LEFT, the same corner the POS dot uses: the cell's
                        // top-right belongs to the favorite pip on every surface.
                        <div
                          className={cn(
                            'absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center bg-blue-600',
                            flush ? cornerClass('flush') : cornerClass('pill'),
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
                        <ProductAvailabilityLine availability={product.availability} muted={false} />
                      </div>
                    ) : (
                      <div className={`flex flex-1 flex-col justify-between gap-1.5 p-2.5 ${selected ? 'bg-blue-600' : 'bg-surface-card'}`}>
                        <p className={`text-xs font-semibold leading-tight ${selected ? 'text-white' : 'text-text-default'}`}>
                          {product.name}
                        </p>
                        <div className="flex flex-col gap-0.5">
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
                          <ProductAvailabilityLine availability={product.availability} muted={selected} />
                        </div>
                      </div>
                    )}
                    {/* Last child — full-cell squared frame above image + caption. */}
                    {pos && selected ? (
                      <span className={KIOSK_POS_CARD_SELECTED_FRAME} aria-hidden />
                    ) : null}
                  </button>
                  {favoritesEnabled && product.sku ? (
                    // ds-raw-button: 32px corner pip over a product photo —
                    // Button would impose its own height, padding and fill.
                    // Chrome is KIOSK_POS_CARD_FAVORITE_PIP*, never a literal.
                    <button
                      type="button"
                      data-testid="product-favorite-pip"
                      aria-pressed={favorited}
                      aria-label={
                        favorited
                          ? `Remove ${product.name} from favorites`
                          : `Add ${product.name} to favorites`
                      }
                      disabled={pendingFavoriteSku !== null}
                      onClick={() => void toggleFavorite(product)}
                      className={cn(
                        KIOSK_POS_CARD_FAVORITE_PIP,
                        favorited
                          ? KIOSK_POS_CARD_FAVORITE_PIP_ON
                          : KIOSK_POS_CARD_FAVORITE_PIP_OFF,
                        pendingFavoriteSku === product.sku && 'opacity-60',
                        focusRing('control', 'neutral'),
                      )}
                    >
                      {/* `fill-current` overrides the icon's `fill="none"`
                          attribute — a pinned star is solid, an unpinned one an
                          outline, which is the only difference a glance needs. */}
                      <Star className={cn('h-4 w-4', favorited && 'fill-current')} />
                    </button>
                  ) : null}
                  </div>
                );
              })}
              {showAddFavoriteTile ? (
                <div className={KIOSK_POS_CARD_CELL}>
                  {/* ds-raw-button: the same card rectangle as a product tile,
                      so the list's own "add" reads as one more tile. */}
                  <button
                    type="button"
                    data-testid="product-add-favorite"
                    onClick={startPinning}
                    className={cn(KIOSK_POS_CARD, 'h-full w-full', focusRing('control', 'neutral'))}
                  >
                    <div className={cn(KIOSK_POS_IMAGE_WELL, 'flex items-center justify-center')}>
                      <span
                        className={cn(
                          'flex h-14 w-14 items-center justify-center bg-surface-sunken text-text-soft',
                          cornerClass('pill'),
                        )}
                        aria-hidden
                      >
                        <Plus className="h-7 w-7" />
                      </span>
                    </div>
                    <div className={KIOSK_POS_CARD_CAPTION}>
                      <p className={KIOSK_TILE_TITLE}>Add favorite</p>
                      <span className={KIOSK_META}>Pin a product to this list</span>
                    </div>
                  </button>
                </div>
              ) : null}
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

      {/* One notice, three reasons the grid is empty. */}
      {!loadingProducts &&
        filteredProducts.length === 0 &&
        !showAddFavoriteTile &&
        (search.trim() !== '' || showFavorites || filteredCategories.length === 0) && (
          <div className={gridNoticeClass} data-testid="catalog-grid-notice">
            {search.trim()
              ? 'No results match your search.'
              : showFavorites
                ? 'Nothing pinned yet — tap the star on a product to add it to favorites.'
                : 'No items found at this level.'}
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
            // The kiosk pane's floating keys — no seam or ground floor (owner 2026-10-03).
            <div className={KIOSK_PANE_FOOTER_BAND} data-kiosk-footer-band>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleAddAnotherItem}
                className="flex-1"
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
                  className="flex-1"
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
          <div className="text-xs font-semibold">Other -- Manual Entry</div>
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
    if (!(breadcrumbs.length > 0 || showAllProducts || showFavorites)) return null;
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 text-role-eyebrow text-text-soft',
          flush && 'border-b border-border-hairline px-4 py-2',
        )}
      >
        {/* The stacked surface has no category dropdown, so this row is the
            only way back to the curated list once the operator has drilled. */}
        {favoritesEnabled ? (
          <>
            {showFavorites ? (
              <span className="text-text-default">Favorites</span>
            ) : (
              // ds-raw-button: inline breadcrumb text link (no chrome)
              <button
                type="button"
                data-testid="stacked-favorites-crumb"
                onClick={() => void fetchFavoriteProducts(0, false)}
                className="transition-colors hover:text-blue-600"
              >
                Favorites
              </button>
            )}
            {showFavorites ? null : (
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-text-faint" />
            )}
          </>
        ) : null}
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

  // ─── Kiosk: trail (command · All products · cart/paperwork/stance) Callers:
  if (kioskSplit) {
    const canGoBack =
      !(loading && !categoriesHydratedRef.current) && breadcrumbs.length > 0;
    const kioskSearchPlaceholder = isAtRoot
      ? 'Search all products'
      : `Search in ${breadcrumbs[breadcrumbs.length - 1]?.name ?? 'this category'}`;
    const catalogTrail = (
              <div className={cn(KIOSK_POS_TRAIL_BAND, 'pl-2 pr-3', KIOSK_POS_TOP_DOCK_INTERACTIVE)} data-testid="kiosk-catalog-trail">
              {/* Command dropdown LEADS the row (mode identity: */}
              {sidebarHeader}
              <IconButton
                icon={<Search className={TOP_CHROME_ICON_FACE} />}
                ariaLabel="Search products"
                aria-pressed={searchOpen}
                size="md"
                onClick={searchOpen ? closeCatalogSearch : openCatalogSearch}
                className={cn(
                  HEADER_ICON_BTN_CLASS,
                  KIOSK_POS_TRAIL_ICON,
                  searchOpen && HEADER_ICON_BTN_OPEN_CLASS,
                )}
                data-testid="kiosk-search-toggle"
              />
              {searchOpen ? (
                <div
                  ref={searchInputHostRef}
                  className="flex min-w-0 flex-1 items-center gap-2"
                  data-testid="kiosk-catalog-search"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeCatalogSearch();
                  }}
                >
                  <SearchField
                    fillHost
                    hideUnderline
                    hideLeadingIcon
                    placeholder={kioskSearchPlaceholder}
                    value={search}
                    onChange={setSearch}
                    className="min-w-0 flex-1"
                  />
                </div>
              ) : null}
              {canGoBack ? (
                // Same family as the search toggle / close above it:
                <IconButton
                  icon={<ChevronLeft className={TOP_CHROME_ICON_FACE} aria-hidden />}
                  ariaLabel="Go back"
                  size="md"
                  disabled={loading}
                  onClick={goBackOneLevel}
                  className={cn(HEADER_ICON_BTN_CLASS, KIOSK_POS_TRAIL_ICON)}
                  data-testid="kiosk-catalog-back"
                />
              ) : null}
              {!searchOpen && (
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
                  value={
                    showFavorites
                      ? KIOSK_FAVORITES_VALUE
                      : (currentCategoryId ?? KIOSK_ALL_PRODUCTS_VALUE)
                  }
                  placeholder={favoritesEnabled ? 'Favorites' : 'All products'}
                  searchPlaceholder="Search categories"
                  className={cn(KIOSK_POS_TRAIL_CONTROL, 'shrink-0 font-medium text-text-default', focusRing('control', 'neutral'))}
                  disabled={loading && !categoriesHydratedRef.current}
                  contentClassName={cn('min-w-72 overflow-hidden', DROPDOWN_SHELL_CORNER)}
                  options={[
                    // Favorites FIRST — the list the counter actually works from
                    // (operator 2026-09-16), with the whole catalog one row
                    // below it and the categories under that.
                    ...(favoritesEnabled
                      ? [{ value: KIOSK_FAVORITES_VALUE, label: 'Favorites' }]
                      : []),
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
                    if (next === KIOSK_FAVORITES_VALUE) {
                      void fetchFavoriteProducts(0, false);
                      return;
                    }
                    if (next === KIOSK_ALL_PRODUCTS_VALUE) {
                      // fetchCategoryLevel(null) is the ALL-products move on
                      // kiosk-split: it returns the tree to root and refreshes
                      // the grid through fetchAllProducts.
                      setShowFavorites(false);
                      void (categoriesHydratedRef.current && !currentCategoryId
                        ? fetchAllProducts(0, false)
                        : fetchCategoryLevel(null));
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
              )}
              {!hideManualEntry ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setShowOther((open) => !open)}
                  className={cn(KIOSK_POS_TRAIL_CONTROL, 'shrink-0')}
                  aria-expanded={showOther}
                  data-testid="kiosk-manual-product-toggle"
                >
                  Can&apos;t find it? Add manually
                </Button>
              ) : null}
              {trailEnd}
            </div>
    );
    const showKioskCta =
      hideCartTray && (continueVisible ?? selectedItems.length > 0) && !!onContinue;
    const browseColumn = (
      // `relative` anchors every floating dock: the glass header (top) and the
      // key (bottom). The product field is the ONLY in-flow element — both
      // chrome units overlay it.
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className={KIOSK_POS_TOP_DOCK}>{catalogTrail}</div>
        <div
          className={cn(
            KIOSK_POS_BROWSE_SCROLL,
            KIOSK_POS_BROWSE_SCROLL_TOP_CLEARANCE,
            // Only while the key is mounted — a permanent reserve would
            // leave dead space at the foot of every browse.
            showKioskCta && KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE,
          )}
        >
          {loading && !categoriesHydratedRef.current && (
            <div className="px-4 py-3.5 text-xs font-semibold text-text-faint">
              Loading...
            </div>
          )}
          {error && (
            <div className="bg-red-50 px-4 py-3.5 text-xs font-semibold text-red-700">{error}</div>
          )}
          {showOther && !hideManualEntry ? (
            <div
              className="mb-3 flex items-end gap-2 border border-border-hairline bg-surface-card p-3"
              data-testid="kiosk-manual-product-entry"
            >
              <TextField
                label="Product name"
                value={otherModelText}
                onChange={setOtherModelText}
                className="min-w-0 flex-1"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleOtherSubmit();
                }}
              />
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleOtherSubmit}
                disabled={!otherModelText.trim()}
                data-testid="kiosk-manual-product-add"
              >
                Add product
              </Button>
            </div>
          ) : null}
          {manualSelectedItems.length > 0 ? (
            <div
              className="mb-3 flex flex-wrap items-center gap-2 border border-border-hairline bg-surface-card px-3 py-2"
              data-testid="kiosk-manual-products-selected"
            >
              <span className={KIOSK_META}>Added manually</span>
              {manualSelectedItems.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name}`}
                >
                  {item.name} ×
                </Button>
              ))}
            </div>
          ) : null}
          {renderProductsGrid()}
        </div>
        {showKioskCta ? (
          <div className={KIOSK_POS_ACTION_BAR} data-kiosk-footer-band>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={onContinue}
              className={KIOSK_POS_CTA}
              data-kiosk-continue
            >
              {continueLabel ??
                (selectedItems.length > 1
                  ? `Continue · ${selectedItems.length} services`
                  : 'Continue')}
            </Button>
          </div>
        ) : null}
      </div>
    );
    return (
      <div
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', KIOSK_POS_CANVAS)}
        data-kiosk-catalog-split
      >
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
            'text-xs font-semibold text-text-faint',
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
          {/* Favorites lead the stage (operator 2026-09-16); in every other
              scope the category list still leads and the grid follows it. */}
          {showFavorites ? (
            <>
              {renderProductsGrid()}
              {filteredCategories.length > 0 && renderStackedCategories()}
            </>
          ) : (
            <>
              {!showAllProducts && filteredCategories.length > 0 && renderStackedCategories()}
              {renderProductsGrid()}
            </>
          )}
        </div>
      )}

      {renderCartTray()}
    </div>
  );
}
