/**
 * Repair-service catalog — "which products count as a repair service", walked up
 * the category tree to a configured or name-matched root. Shared by the staff
 * `/api/repair/ecwid-products` route and its device-authed kiosk sibling so the
 * two cannot drift.
 *
 * ## Where the rows come from (2026-07-29e)
 *
 * **The local projection first; the vendor only as a cold-start fallback.**
 * `platform_listings` + `platform_catalog_categories` hold the sell price and the
 * category tree, so a drill is a Postgres read instead of paging the storefront.
 * The live walk survives for orgs with nothing projected yet and as the
 * degrade-path when a projection read fails — it is not the steady state.
 *
 * ## STALENESS CONTRACT — read this before "fixing" it into a live read
 *
 * The projection is authoritative for **DISPLAY**. The provider is authoritative
 * for **MONEY**: catalog lines are charged by `catalog_object_id` and re-priced by
 * the provider at charge time, so a drifted local price can show a stale number
 * but can never overcharge a customer. A charge rejected on drift triggers a
 * background refresh (`/api/cron/catalog-projection`).
 *
 * Reverting these readers to a live-only read would put the ~16s cold storefront
 * walk back on a consumer-facing form. That regression is the reason the
 * projection exists; the two-tier cache below was the workaround for it.
 *
 * ## Credentials
 *
 * The fallback fetchers still read env (`ECWID_STORE_ID`/`ECWID_API_TOKEN` +
 * legacy aliases), as this module always has. The PROJECTION WRITER
 * (`projectEcwidCatalog`) is vault-first via `resolveEcwidCreds(orgId)`, because a
 * projected row carries an `organization_id` and guessing the tenant from env was
 * never an option for a write.
 */

import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';
const ECWID_PAGE_LIMIT = 100;

// ── Two-tier cache (mirrors src/lib/catalog/org-catalog.ts) ──────────────────
// L1 per-instance Map in front of L2 shared Redis. L1 matters more here than
// elsewhere: `REDIS_CACHE_DISABLED=true` is a normal local-dev setting, and a
// cold call costs ~25 SEQUENTIAL Ecwid page fetches (~15s) because the repair
// filter has to page the entire storefront to find the ~47 `-RS` services.
// Redis alone would leave dev — and any Redis outage — on that 15s path.
interface L1Entry<T> {
  value: T;
  expiresAt: number;
}
const L1_TTL_MS = 5 * 60 * 1000;
const REDIS_TTL_S = CACHE_TTL.reference;
const l1Cache = new Map<string, L1Entry<unknown>>();

async function twoTier<T>(orgId: string, key: string, loader: () => Promise<T>): Promise<T> {
  const l1Key = `${orgId}:${key}`;
  const hit = l1Cache.get(l1Key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const value = await getOrSet(
    CACHE_NS.ecwidRepairCatalog,
    orgId,
    key,
    REDIS_TTL_S,
    [CACHE_TAGS.skuCatalog],
    loader,
  );
  l1Cache.set(l1Key, { value, expiresAt: Date.now() + L1_TTL_MS });
  return value;
}

export interface EcwidProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  thumbnailUrl: string | null;
  enabled: boolean;
  inStock: boolean;
  categoryIds: string[];
}

export interface EcwidCategory {
  id?: number | string;
  parentId?: number | string | null;
  name?: string | null;
}

interface EcwidRawProduct {
  id?: number | string;
  name?: string | null;
  sku?: string | null;
  price?: number | null;
  thumbnailUrl?: string | null;
  enabled?: boolean;
  inStock?: boolean;
  categoryIds?: (number | string)[];
  [key: string]: unknown;
}

function requiredEnvAny(primaryName: string, aliases: string[] = []): string {
  for (const key of [primaryName, ...aliases]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new Error(`Missing required environment variable: ${primaryName}`);
}

/** The 4-alias env lookup every repair/Ecwid route repeats — one place to read it. */
export function resolveEcwidStoreCreds(): { storeId: string; token: string } {
  return {
    storeId: requiredEnvAny('ECWID_STORE_ID', ['ECWID_STOREID', 'ECWID_STORE', 'NEXT_PUBLIC_ECWID_STORE_ID']),
    token: requiredEnvAny('ECWID_API_TOKEN', ['ECWID_TOKEN', 'ECWID_ACCESS_TOKEN', 'NEXT_PUBLIC_ECWID_API_TOKEN']),
  };
}

function asId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseConfiguredCategoryIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function findFallbackRootIds(categories: EcwidCategory[]): string[] {
  const exactMatch = categories
    .filter((category) => normalizeName(String(category.name || '')) === 'bose repair service')
    .map((category) => asId(category.id))
    .filter((id): id is string => Boolean(id));

  if (exactMatch.length > 0) return exactMatch;

  return categories
    .filter((category) => {
      const name = normalizeName(String(category.name || ''));
      return name.includes('repair') && name.includes('service');
    })
    .map((category) => asId(category.id))
    .filter((id): id is string => Boolean(id));
}

function buildCategoryMap(categories: EcwidCategory[]): Map<string, EcwidCategory> {
  const map = new Map<string, EcwidCategory>();
  for (const category of categories) {
    const id = asId(category.id);
    if (id) map.set(id, category);
  }
  return map;
}

function buildChildMap(categories: EcwidCategory[]): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>();

  for (const category of categories) {
    const id = asId(category.id);
    if (!id) continue;

    const parentId = asId(category.parentId);
    const list = map.get(parentId) || [];
    list.push(id);
    map.set(parentId, list);
  }

  return map;
}

function buildFullPath(categoryId: string, categoryMap: Map<string, EcwidCategory>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = categoryId;

  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);

    const node = categoryMap.get(cursor);
    if (!node) break;

    const name = String(node.name || '').trim();
    if (name) names.unshift(name);

    cursor = asId(node.parentId);
  }

  return names.join(' > ');
}

function buildBreadcrumbs(
  currentParentId: string | null,
  rootSet: Set<string>,
  categoryMap: Map<string, EcwidCategory>,
): Array<{ id: string; name: string }> {
  if (!currentParentId) return [];

  const path: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let cursor: string | null = currentParentId;

  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);

    const node = categoryMap.get(cursor);
    if (!node) break;

    path.unshift({
      id: cursor,
      name: String(node.name || '').trim() || `Category ${cursor}`,
    });

    if (rootSet.has(cursor)) break;

    cursor = asId(node.parentId);
  }

  return path;
}

function getLevelCategories(params: {
  currentParentId: string | null;
  rootIds: string[];
  rootSet: Set<string>;
  categoryMap: Map<string, EcwidCategory>;
  childMap: Map<string | null, string[]>;
}): RepairCategoryNode[] {
  const { currentParentId, rootIds, rootSet, categoryMap, childMap } = params;

  const idsAtLevel = currentParentId
    ? childMap.get(currentParentId) || []
    : rootIds.flatMap((rootId) => childMap.get(rootId) || []);

  return idsAtLevel
    .filter((id) => isCategoryUnderRepairRoots(id, rootSet, categoryMap))
    .map((id) => {
      const category = categoryMap.get(id);
      const parentId = asId(category?.parentId);
      const hasChildren = (childMap.get(id)?.length || 0) > 0;
      const fullPath = buildFullPath(id, categoryMap);
      const depth = Math.max(0, fullPath.split(' > ').length - 1);

      return {
        id,
        name: String(category?.name || '').trim() || `Category ${id}`,
        parentId,
        hasChildren,
        isLeaf: !hasChildren,
        depth,
        fullPath,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RepairCategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  hasChildren: boolean;
  isLeaf: boolean;
  depth: number;
  fullPath: string;
}

export interface RepairCategoryLevel {
  roots: Array<{ id: string | null; name: string }>;
  currentParentId: string | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  categories: RepairCategoryNode[];
  /** Set only when no repair root could be resolved — callers surface it as a teaching message. */
  message?: string;
}

/**
 * One level of the repair category tree (children of `requestedParentId`, or
 * of the repair root(s) when null) plus its breadcrumb trail. A parentId that
 * isn't under a repair root is ignored rather than honored — the tree can
 * never be walked outside the repair subtree.
 */
async function resolveRepairCategoryLevel(
  storeId: string,
  token: string,
  requestedParentIdRaw: string | null,
): Promise<RepairCategoryLevel> {
  const categories = await fetchAllEcwidCategories(storeId, token);
  return resolveRepairCategoryLevelFrom(categories, requestedParentIdRaw);
}

/**
 * The PURE half of {@link resolveRepairCategoryLevel} — everything after the
 * fetch. Split out so the local projection and the live vendor walk produce
 * byte-identical levels by running literally the same code, rather than by two
 * implementations agreeing for now.
 */
export function resolveRepairCategoryLevelFrom(
  categories: EcwidCategory[],
  requestedParentIdRaw: string | null,
): RepairCategoryLevel {
  const categoryMap = buildCategoryMap(categories);
  const childMap = buildChildMap(categories);

  const configuredRootIds = parseConfiguredCategoryIds(process.env.ECWID_REPAIR_CATEGORY_IDS);
  const rootIds = configuredRootIds.length > 0
    ? configuredRootIds.filter((id) => categoryMap.has(id))
    : findFallbackRootIds(categories);

  if (rootIds.length === 0) {
    return {
      roots: [],
      currentParentId: null,
      breadcrumbs: [],
      categories: [],
      message: 'No repair root category found. Set ECWID_REPAIR_CATEGORY_IDS or create category named Bose Repair Service.',
    };
  }

  const requestedParentId = asId(requestedParentIdRaw);
  const rootSet = new Set(rootIds);

  let currentParentId: string | null = null;
  if (requestedParentId && isCategoryUnderRepairRoots(requestedParentId, rootSet, categoryMap)) {
    currentParentId = requestedParentId;
  }

  return {
    roots: rootIds
      .map((id) => categoryMap.get(id))
      .filter(Boolean)
      .map((category) => ({ id: asId(category?.id), name: String(category?.name || '') })),
    currentParentId,
    breadcrumbs: buildBreadcrumbs(currentParentId, rootSet, categoryMap),
    categories: getLevelCategories({ currentParentId, rootIds, rootSet, categoryMap, childMap }),
  };
}

function isCategoryUnderRepairRoots(
  categoryId: string,
  rootSet: Set<string>,
  categoryMap: Map<string, EcwidCategory>,
): boolean {
  const seen = new Set<string>();
  let cursor: string | null = categoryId;

  while (cursor) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);

    if (rootSet.has(cursor)) return true;

    const node = categoryMap.get(cursor);
    if (!node) return false;
    cursor = asId(node.parentId);
  }

  return false;
}

/** Every category in the store, paged. Exported for the projection writer. */
export async function fetchAllEcwidCategories(storeId: string, token: string): Promise<EcwidCategory[]> {
  const categories: EcwidCategory[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/categories`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(ECWID_PAGE_LIMIT));

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ecwid category list request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { items?: EcwidCategory[] } | EcwidCategory[];
    const pageItems = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    categories.push(...pageItems);

    if (pageItems.length < ECWID_PAGE_LIMIT) break;
    offset += ECWID_PAGE_LIMIT;
  }

  return categories;
}

/**
 * Every enabled product in the store, paged. This is the SLOW walk (~25
 * sequential pages / ~16s on the dogfood store) — it is the projection writer's
 * job to run it on a schedule, not a reader's job to run it per drill.
 */
export async function fetchAllEcwidProducts(storeId: string, token: string): Promise<EcwidProduct[]> {
  const products: EcwidProduct[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/products`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(ECWID_PAGE_LIMIT));
    url.searchParams.set('enabled', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ecwid products request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { items?: EcwidRawProduct[]; total?: number } | EcwidRawProduct[];
    const pageItems: EcwidRawProduct[] = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
        ? data.items
        : [];

    for (const item of pageItems) {
      const id = item.id != null ? String(item.id) : null;
      if (!id) continue;

      products.push({
        id,
        name: String(item.name || '').trim() || `Product ${id}`,
        sku: String(item.sku || '').trim(),
        price: typeof item.price === 'number' ? item.price : null,
        thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
        enabled: item.enabled !== false,
        inStock: item.inStock !== false,
        categoryIds: Array.isArray(item.categoryIds)
          ? item.categoryIds.map((cid) => String(cid))
          : [],
      });
    }

    if (pageItems.length < ECWID_PAGE_LIMIT) break;
    offset += ECWID_PAGE_LIMIT;
  }

  return products.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve the repair ROOT category ids from a category set.
 *
 * Config-first (`ECWID_REPAIR_CATEGORY_IDS`), then a name-matched fallback. This
 * runs at READ time on purpose: root membership is never projected, so
 * re-pointing the repair root is a config change rather than a re-sync.
 */
function resolveRepairRootIds(categories: EcwidCategory[]): string[] {
  const categoryMap = buildCategoryMap(categories);
  const configured = parseConfiguredCategoryIds(process.env.ECWID_REPAIR_CATEGORY_IDS);
  return configured.length > 0
    ? configured.filter((id) => categoryMap.has(id))
    : findFallbackRootIds(categories);
}

/**
 * Keep only the products whose category chain reaches a repair root.
 *
 * The PURE half of {@link fetchRepairRootProducts}: the live path narrows by
 * asking the vendor per-category, the projected path already holds every row and
 * narrows here. Same predicate either way.
 *
 * No repair root resolvable → every product passes, preserving the live path's
 * deliberate "everything" fallback rather than silently serving an empty catalog.
 */
export function filterRepairRootProducts(
  products: EcwidProduct[],
  categories: EcwidCategory[],
): EcwidProduct[] {
  const rootIds = resolveRepairRootIds(categories);
  if (rootIds.length === 0) return [...products].sort((a, b) => a.name.localeCompare(b.name));

  const categoryMap = buildCategoryMap(categories);
  const rootSet = new Set(rootIds);
  // Memoize the chain walk: on the dogfood store ~2.5k products share ~150
  // categories, so the uncached version re-walks the same parent chains
  // thousands of times.
  const underRoot = new Map<string, boolean>();
  const isUnder = (categoryId: string): boolean => {
    const cached = underRoot.get(categoryId);
    if (cached !== undefined) return cached;
    const result = isCategoryUnderRepairRoots(categoryId, rootSet, categoryMap);
    underRoot.set(categoryId, result);
    return result;
  };

  return products
    .filter((product) => product.categoryIds.some(isUnder))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Repair-service SKUs carry the `-RS` suffix (e.g. `00958-RS`) — everything
 *  else under the repair root (shipping fees, warranty add-ons, spare parts)
 *  shares the category but isn't itself a repair service. Case-insensitive:
 *  Ecwid SKU casing isn't consistently enforced. */
export function isRepairServiceSku(sku: string): boolean {
  return sku.trim().toUpperCase().endsWith('-RS');
}

/**
 * The full "products that count as a repair service" list — fetches products
 * + categories, resolves the repair root(s) (env-configured `ECWID_REPAIR_CATEGORY_IDS`
 * or a name-matched fallback), and filters to products whose category chain
 * reaches one of those roots. Unpaginated — callers slice as needed.
 */
/**
 * The repair-service product list — **projection first, vendor as fallback.**
 *
 * Reads the local `platform_listings` projection (2026-07-29e), which carries the
 * sell price and category membership the counter needs to total a cart offline.
 * When nothing is projected — a fresh org, a tenant that just connected, or a
 * projection cron that has never run — it falls back to the live vendor walk so
 * the surface still works on day one. That fallback is the COLD-START path, not
 * the steady state.
 *
 * The Redis/L1 cache stays in front of both. It is no longer load-bearing for the
 * projected path (a Postgres read is cheap), but it still absorbs the fallback,
 * and `getOrSet` is fail-open + single-flight so a cold cache under concurrent
 * taps rebuilds once.
 */
export async function fetchRepairRootProductsCached(
  storeId: string,
  token: string,
  orgId: string,
): Promise<EcwidProduct[]> {
  return twoTier(orgId, `repair-root-products:${storeId}`, async () => {
    const projected = await loadProjectedRepairProducts(orgId);
    if (projected) return projected;
    return fetchRepairRootProducts(storeId, token);
  });
}

/**
 * Cached twin of {@link resolveRepairCategoryLevel} — projection first, same
 * cold-start fallback.
 *
 * The level is assembled by {@link resolveRepairCategoryLevelFrom} either way, so
 * a projected level and a live level are produced by the same code and cannot
 * drift in shape.
 */
export async function resolveRepairCategoryLevelCached(
  storeId: string,
  token: string,
  requestedParentIdRaw: string | null,
  orgId: string,
): Promise<RepairCategoryLevel> {
  const parentKey = asId(requestedParentIdRaw) ?? 'root';
  return twoTier(orgId, `repair-category-level:${storeId}:${parentKey}`, async () => {
    const categories = await loadProjectedCategoriesSafely(orgId);
    if (categories && categories.length > 0) {
      return resolveRepairCategoryLevelFrom(categories, requestedParentIdRaw);
    }
    return resolveRepairCategoryLevel(storeId, token, requestedParentIdRaw);
  });
}

/**
 * Projected products, already narrowed to the repair roots — or null to mean
 * "nothing projected, use the vendor".
 *
 * Null vs `[]` is the load-bearing distinction: an empty array would be a
 * legitimate "this store has no repair services", and returning it on a
 * not-yet-projected org would render an empty picker instead of falling back.
 *
 * A projection read that THROWS also returns null. A broken mirror must degrade
 * to the slow-but-correct vendor path, never to an empty catalog.
 */
async function loadProjectedRepairProducts(orgId: string): Promise<EcwidProduct[] | null> {
  try {
    const { loadProjectedListings, loadProjectedCategories } = await import(
      '@/lib/repair/catalog-projection'
    );
    const [listings, categories] = await Promise.all([
      loadProjectedListings(orgId),
      loadProjectedCategories(orgId),
    ]);
    if (listings.length === 0) return null;
    return filterRepairRootProducts(listings, categories);
  } catch (err) {
    console.warn('[repair-catalog] projection read failed — falling back to vendor', err);
    return null;
  }
}

/** Projected categories, or null when unavailable (see the note above). */
async function loadProjectedCategoriesSafely(orgId: string): Promise<EcwidCategory[] | null> {
  try {
    const { loadProjectedCategories } = await import('@/lib/repair/catalog-projection');
    return await loadProjectedCategories(orgId);
  } catch (err) {
    console.warn('[repair-catalog] projected categories unavailable — falling back', err);
    return null;
  }
}

/** How many category product-fetches run at once. Ecwid is fine with this and
 *  it turns the cold rebuild from sequential into ~2 waves. */
const CATEGORY_FETCH_CONCURRENCY = 6;

/** Every enabled product assigned to ONE category, following pagination. */
async function fetchProductsInCategory(
  storeId: string,
  token: string,
  categoryId: string,
): Promise<EcwidProduct[]> {
  const products: EcwidProduct[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/products`);
    url.searchParams.set('category', categoryId);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(ECWID_PAGE_LIMIT));
    url.searchParams.set('enabled', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ecwid products request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { items?: EcwidRawProduct[] } | EcwidRawProduct[];
    const pageItems: EcwidRawProduct[] = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
        ? data.items
        : [];

    for (const item of pageItems) {
      const id = item.id != null ? String(item.id) : null;
      if (!id) continue;
      products.push({
        id,
        name: String(item.name || '').trim() || `Product ${id}`,
        sku: String(item.sku || '').trim(),
        price: typeof item.price === 'number' ? item.price : null,
        thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
        enabled: item.enabled !== false,
        inStock: item.inStock !== false,
        categoryIds: Array.isArray(item.categoryIds) ? item.categoryIds.map((cid) => String(cid)) : [],
      });
    }

    if (pageItems.length < ECWID_PAGE_LIMIT) break;
    offset += ECWID_PAGE_LIMIT;
  }

  return products;
}

/**
 * The full "products that count as a repair service" list.
 *
 * Asks Ecwid only for the repair categories' own products (roots + every
 * descendant, fetched with bounded concurrency) instead of paging the entire
 * storefront and filtering client-side. On the dogfood store that is ~2.5k
 * products across ~25 SEQUENTIAL pages (~16s) versus ~8 small parallel
 * fetches — the difference between a visible stall and an instant drill on a
 * cold cache. Unpaginated; callers slice.
 */
async function fetchRepairRootProducts(storeId: string, token: string): Promise<EcwidProduct[]> {
  const categories = await fetchAllEcwidCategories(storeId, token);
  const categoryMap = buildCategoryMap(categories);
  const configuredRootIds = parseConfiguredCategoryIds(process.env.ECWID_REPAIR_CATEGORY_IDS);
  const rootIds = configuredRootIds.length > 0
    ? configuredRootIds.filter((id) => categoryMap.has(id))
    : findFallbackRootIds(categories);

  const rootSet = new Set(rootIds);
  // No repair root resolvable — preserve the old "everything" fallback rather
  // than silently returning an empty catalog.
  if (rootSet.size === 0) return fetchAllEcwidProducts(storeId, token);

  const targetIds = Array.from(
    new Set([
      ...rootIds,
      ...categories
        .map((category) => asId(category.id))
        .filter((id): id is string => Boolean(id))
        .filter((id) => isCategoryUnderRepairRoots(id, rootSet, categoryMap)),
    ]),
  );

  // Dedupe by product id — a product may sit in several repair categories.
  const byId = new Map<string, EcwidProduct>();
  for (let i = 0; i < targetIds.length; i += CATEGORY_FETCH_CONCURRENCY) {
    const wave = targetIds.slice(i, i + CATEGORY_FETCH_CONCURRENCY);
    const results = await Promise.all(
      wave.map((categoryId) => fetchProductsInCategory(storeId, token, categoryId)),
    );
    for (const list of results) {
      for (const product of list) byId.set(product.id, product);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
