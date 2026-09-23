/**
 * Shared query parsing + response shaping for the two kiosk catalog routes
 * (`/api/kiosk/sales/ecwid-products`, `/api/kiosk/repair/ecwid-products`).
 *
 * Both rails must accept the SAME query grammar and emit the SAME wire shape —
 * that is the contract `ProductSelector` relies on when it swaps `apiBasePath`
 * between retail and repair. The two routes previously hand-rolled identical
 * clamp/parse blocks and drifted (sales grew a `barcode` mode the repair twin
 * never got). This module is the one place that grammar is decided.
 *
 * Pure and DB-free: `searchKioskCatalog` owns the read.
 */

import { isSearchableCatalogQuery, normalizeCatalogQuery } from './catalog-search-pure';
import type { CatalogAvailability } from './catalog-search-pure';
import type { KioskCatalogPage, KioskCatalogSearchOptions } from './catalog-search';
import type { FavoriteWorkspaceKey } from '@/lib/favorites/favorite-sku-key';

/** Page ceiling. The grid asks for 24; a scan asks for 1. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 24;

/** The segment-free half of the search options — the route supplies `segment`. */
export type ParsedCatalogOptions = Omit<KioskCatalogSearchOptions, 'segment'>;

export type ParsedCatalogQuery =
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

export interface KioskCatalogWireResponse {
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

/**
 * Parse the shared catalog query grammar.
 *
 * A `q` or a `barcode` is self-scoping: it searches the whole segment and needs
 * no `categoryId`. Only a pure BROWSE must name its scope — `mode=all`,
 * `mode=favorites`, or a `categoryId` — otherwise a bare request would page the
 * entire projection by accident.
 *
 * A `q` shorter than the search floor is treated as absent rather than
 * rejected: the picker sends every keystroke, and a 400 on the first character
 * would make the grid flash an error while someone is still typing.
 *
 * `favoritesWorkspace` is the RAIL's own list — the route names it (repair vs
 * sales), never the client, so a device cannot read another rail's favorites by
 * editing a query string.
 */
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
      /**
       * Scope precedence, decided once, here.
       *
       * A barcode is an identity and a query searches the whole segment, so
       * both discard the category the operator happened to be drilled into and
       * the favorites scope alike. Keeping the category was the original
       * defect: a walk-in asking for a product got "no results" because the
       * staffer was three categories deep. `mode=all` / `mode=favorites`
       * likewise outrank a stale categoryId the client may still be holding.
       */
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
