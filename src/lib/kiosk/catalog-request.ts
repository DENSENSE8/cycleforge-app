/** Shared query parsing + response shaping for the two kiosk catalog routes (`/api/kiosk/sales/ecwid-products`,… */

import { isSearchableCatalogQuery, normalizeCatalogQuery } from './catalog-search-pure';
import type { CatalogAvailability } from './catalog-search-pure';
import type { KioskCatalogPage, KioskCatalogSearchOptions } from './catalog-search';
import type { FavoriteWorkspaceKey } from '@/lib/favorites/favorite-sku-key';

/** Page ceiling. The grid asks for 24; a scan asks for 1. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 24;

/** The segment-free half of the search options — the route supplies `segment`. */
type ParsedCatalogOptions = Omit<KioskCatalogSearchOptions, 'segment'>;

type ParsedCatalogQuery =
  | { ok: true; options: ParsedCatalogOptions }
  | { ok: false; error: string };

/** One product as the kiosk wire carries it: the vendor shape plus availability. */
export interface KioskCatalogWireProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  thumbnailUrl: string | null;
  enabled: boolean;
  inStock: boolean;
  categoryIds: string[];
  availability: CatalogAvailability;
}

interface KioskCatalogWireResponse {
  success: true;
  products: KioskCatalogWireProduct[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

/** Parse the shared catalog query grammar. */
export function readKioskCatalogQuery(
  params: URLSearchParams,
  rail?: { favoritesWorkspace?: FavoriteWorkspaceKey | null },
): ParsedCatalogQuery {
  const limit = clampInt(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

  const mode = String(params.get('mode') ?? '').trim().toLowerCase();
  const categoryId = String(params.get('categoryId') ?? '').trim() || null;
  const barcode = String(params.get('barcode') ?? '').trim() || null;
  const rawQuery = normalizeCatalogQuery(params.get('q'));
  const query = isSearchableCatalogQuery(rawQuery) ? rawQuery : null;
  const favoritesRequested = mode === 'favorites';

  if (favoritesRequested && !rail?.favoritesWorkspace) {
    return { ok: false, error: 'This catalog rail has no favorites list' };
  }

  if (!barcode && !query && mode !== 'all' && !favoritesRequested && !categoryId) {
    return { ok: false, error: 'categoryId, q, barcode, mode=all, or mode=favorites is required' };
  }

  const selfScoping = Boolean(barcode || query);

  return {
    ok: true,
    options: {
      query,
      barcode,
      /** Scope precedence, decided once, here. */
      categoryId: mode === 'all' || favoritesRequested || selfScoping ? null : categoryId,
      favoritesWorkspace:
        favoritesRequested && !selfScoping ? (rail?.favoritesWorkspace ?? null) : null,
      limit,
      offset,
    },
  };
}

/** Flatten a search page onto the wire shape the picker consumes. */
export function toKioskCatalogResponse(page: KioskCatalogPage): KioskCatalogWireResponse {
  return {
    success: true,
    products: page.hits.map((hit) => ({ ...hit.product, availability: hit.availability })),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.hasMore,
  };
}
