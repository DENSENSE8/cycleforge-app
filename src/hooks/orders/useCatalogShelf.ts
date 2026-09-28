'use client';

/**
 * One storefront shelf, as state — Sales or Repair service
 * (`CatalogShelf`), over the staff-authed twins of the counter's catalog
 * rails (`/api/orders/intake/catalog/*?shelf=`): one category level with its
 * breadcrumb trail, the product page for the current scope, a catalog search,
 * and paging. Both faces of the new-sales-order Products step mount one per
 * shelf, so switching shelves keeps each one's crumb and page.
 *
 * Scope precedence mirrors the counter: the grid lands on the shelf's curated
 * favorites when that list is non-empty, else on the whole shelf; a category
 * drill replaces the scope's grid with that category's products, returning to
 * the root restores the scope, and a search (≥2 chars) replaces the grid until
 * it is cleared.
 *
 * Every fetch carries a generation: a response that lands after the operator
 * moved on (drilled deeper, switched scope, typed on) is dropped, never painted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KioskCatalogWireProduct } from '@/lib/kiosk/catalog-request';
import type { RepairCategoryNode } from '@/lib/repair/ecwid-repair-catalog';
import type { CatalogShelf } from '@/lib/orders/intake/catalog-shelf';

const CATALOG_API = '/api/orders/intake/catalog';
/** Rows per page — the counter's page. */
export const CATALOG_PAGE_SIZE = 24;

/** Root scope — what the grid shows with no category drilled. */
export type CatalogShelfScope = 'favorites' | 'all';
export type CatalogShelfProduct = KioskCatalogWireProduct;
export type CatalogShelfCategory = RepairCategoryNode;
export interface CatalogShelfCrumb {
  id: string;
  name: string;
}

export interface CatalogShelfState {
  shelf: CatalogShelf;
  /** Root scope; favorites only when the shelf's list was non-empty on mount. */
  scope: CatalogShelfScope;
  /** The shelf's favorites list has members — offer the Favorites scope. */
  hasFavorites: boolean;
  /** Drilled category, `null` at the root. */
  categoryId: string | null;
  /** Root → current category (empty at the root). */
  breadcrumbs: CatalogShelfCrumb[];
  /** Sub-categories of the current level. */
  categories: CatalogShelfCategory[];
  /** The grid: the scope / category page, or the search page while searching. */
  products: CatalogShelfProduct[];
  /** A search is on the grid. */
  searching: boolean;
  hasMore: boolean;
  /** A level or first page is in flight. */
  loading: boolean;
  /** A next page is in flight. */
  loadingMore: boolean;
  error: string | null;
  /** Drill into a category; `null` returns to the root of the current scope. */
  goCategory: (id: string | null) => void;
  /** One level up; at depth 1, the root. */
  goBack: () => void;
  showFavorites: () => void;
  showAll: () => void;
  /** Search the shelf (≥2 chars); `null` / shorter returns to the browse view it left. */
  search: (query: string | null) => void;
  loadMore: () => void;
}

type View =
  | { kind: 'favorites' }
  | { kind: 'all' }
  | { kind: 'category'; id: string }
  | { kind: 'search'; q: string };

interface CategoriesResponse {
  success?: boolean;
  error?: string;
  currentParentId?: string | null;
  breadcrumbs?: CatalogShelfCrumb[];
  categories?: CatalogShelfCategory[];
}

interface ProductsResponse {
  success?: boolean;
  error?: string;
  products?: CatalogShelfProduct[];
  hasMore?: boolean;
}

function productsUrl(shelf: CatalogShelf, view: View, offset: number): string {
  const scope =
    view.kind === 'category'
      ? `categoryId=${encodeURIComponent(view.id)}`
      : view.kind === 'search'
        ? `q=${encodeURIComponent(view.q)}`
        : `mode=${view.kind}`;
  return `${CATALOG_API}/ecwid-products?shelf=${shelf}&${scope}&limit=${CATALOG_PAGE_SIZE}&offset=${offset}`;
}

async function getJson<T extends { success?: boolean; error?: string }>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  const body = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !body || body.success === false) throw new Error(body?.error || fallback);
  return body;
}

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function useCatalogShelf(shelf: CatalogShelf): CatalogShelfState {
  const [scope, setScope] = useState<CatalogShelfScope>('all');
  const [hasFavorites, setHasFavorites] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<CatalogShelfCrumb[]>([]);
  const [categories, setCategories] = useState<CatalogShelfCategory[]>([]);
  const [products, setProducts] = useState<CatalogShelfProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [levelLoading, setLevelLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Bumped per category-level request; a stale level is dropped. */
  const levelGen = useRef(0);
  /** Bumped per first-page request; a stale page (or next page of an old view) is dropped. */
  const pageGen = useRef(0);
  const viewRef = useRef<View>({ kind: 'all' });
  /** The browse view a search replaced — clearing the search returns to it. */
  const browseRef = useRef<View>({ kind: 'all' });
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const scopeRef = useRef<CatalogShelfScope>('all');
  const crumbsRef = useRef<CatalogShelfCrumb[]>([]);

  const loadLevel = useCallback(
    async (parentId: string | null) => {
      const gen = ++levelGen.current;
      setLevelLoading(true);
      try {
        const parent = parentId ? `&parentId=${encodeURIComponent(parentId)}` : '';
        const body = await getJson<CategoriesResponse>(`${CATALOG_API}/ecwid-categories?shelf=${shelf}${parent}`, 'Failed to load categories');
        if (gen !== levelGen.current) return;
        const crumbs = Array.isArray(body.breadcrumbs) ? body.breadcrumbs : [];
        crumbsRef.current = crumbs;
        setCategories(Array.isArray(body.categories) ? body.categories : []);
        setBreadcrumbs(crumbs);
        setCategoryId(body.currentParentId ?? null);
      } catch (err) {
        if (gen !== levelGen.current) return;
        setError(message(err, 'Failed to load categories'));
      } finally {
        if (gen === levelGen.current) setLevelLoading(false);
      }
    },
    [shelf],
  );

  const loadPage = useCallback(
    async (view: View) => {
      const gen = ++pageGen.current;
      viewRef.current = view;
      if (view.kind !== 'search') browseRef.current = view;
      setSearching(view.kind === 'search');
      offsetRef.current = 0;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setPageLoading(true);
      setHasMore(false);
      try {
        const body = await getJson<ProductsResponse>(productsUrl(shelf, view, 0), 'Failed to load products');
        if (gen !== pageGen.current) return;
        const rows = Array.isArray(body.products) ? body.products : [];
        offsetRef.current = rows.length;
        setProducts(rows);
        setHasMore(Boolean(body.hasMore));
      } catch (err) {
        if (gen !== pageGen.current) return;
        setProducts([]);
        setError(message(err, 'Failed to load products'));
      } finally {
        if (gen === pageGen.current) setPageLoading(false);
      }
    },
    [shelf],
  );

  const goCategory = useCallback(
    (id: string | null) => {
      setError(null);
      if (id) {
        // Optimistic crumb, so the trail answers the tap before the level lands.
        setCategoryId(id);
        void loadLevel(id);
        void loadPage({ kind: 'category', id });
        return;
      }
      setCategoryId(null);
      setBreadcrumbs([]);
      crumbsRef.current = [];
      void loadLevel(null);
      void loadPage({ kind: scopeRef.current });
    },
    [loadLevel, loadPage],
  );

  const goBack = useCallback(() => {
    const crumbs = crumbsRef.current;
    goCategory(crumbs.length >= 2 ? crumbs[crumbs.length - 2]!.id : null);
  }, [goCategory]);

  const enterScope = useCallback(
    (next: CatalogShelfScope) => {
      scopeRef.current = next;
      setScope(next);
      goCategory(null);
    },
    [goCategory],
  );
  const showFavorites = useCallback(() => enterScope('favorites'), [enterScope]);
  const showAll = useCallback(() => enterScope('all'), [enterScope]);

  const search = useCallback(
    (query: string | null) => {
      const q = (query ?? '').trim();
      setError(null);
      if (q.length >= 2) {
        void loadPage({ kind: 'search', q });
        return;
      }
      // Back to the browse view the search replaced — same crumb, same scope.
      if (viewRef.current.kind === 'search') void loadPage(browseRef.current);
    },
    [loadPage],
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const gen = pageGen.current;
    const view = viewRef.current;
    const offset = offsetRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const body = await getJson<ProductsResponse>(productsUrl(shelf, view, offset), 'Failed to load products');
      if (gen !== pageGen.current) return;
      const rows = Array.isArray(body.products) ? body.products : [];
      offsetRef.current = offset + rows.length;
      setProducts((prev) => [...prev, ...rows]);
      setHasMore(Boolean(body.hasMore));
    } catch (err) {
      if (gen !== pageGen.current) return;
      setHasMore(false);
      setError(message(err, 'Failed to load products'));
    } finally {
      if (gen === pageGen.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [shelf]);

  /* Mount: the root level and the favorites membership in parallel; the membership decides the landing scope. */
  useEffect(() => {
    void loadLevel(null);
    const gen = pageGen.current;
    let cancelled = false;
    void (async () => {
      let skus: string[] = [];
      try {
        const res = await fetch(`${CATALOG_API}/favorites?shelf=${shelf}`, { credentials: 'same-origin' });
        const body = (await res.json().catch(() => null)) as { skus?: unknown } | null;
        if (res.ok && Array.isArray(body?.skus)) skus = body.skus.filter((s): s is string => typeof s === 'string');
      } catch {
        /* Favorites degrade to the whole shelf — never break the product step. */
      }
      if (cancelled) return;
      setHasFavorites(skus.length > 0);
      // The operator already chose a scope, drilled or searched while membership loaded.
      if (gen !== pageGen.current) return;
      const landing: CatalogShelfScope = skus.length > 0 ? 'favorites' : 'all';
      scopeRef.current = landing;
      setScope(landing);
      void loadPage({ kind: landing });
    })();
    return () => {
      cancelled = true;
      // Drop every in-flight answer — the step unmounted.
      levelGen.current += 1;
      pageGen.current += 1;
    };
  }, [shelf, loadLevel, loadPage]);

  return {
    shelf,
    scope,
    hasFavorites,
    categoryId,
    breadcrumbs,
    categories,
    products,
    searching,
    hasMore,
    loading: levelLoading || pageLoading,
    loadingMore,
    error,
    goCategory,
    goBack,
    showFavorites,
    showAll,
    search,
    loadMore,
  };
}
