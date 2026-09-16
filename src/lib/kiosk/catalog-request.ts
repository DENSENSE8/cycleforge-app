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
 * no `categoryId`. Only a pure BROWSE must name its scope, hence `mode=all` —
 * otherwise a bare request would page the entire projection by accident.
 *
 * A `q` shorter than the search floor is treated as absent rather than
 * rejected: the picker sends every keystroke, and a 400 on the first character
 * would make the grid flash an error while someone is still typing.
 */
export function readKioskCatalogQuery(params: URLSearchParams): ParsedCatalogQuery {
  const limit = clampInt(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

  const mode = String(params.get('mode') ?? '').trim().toLowerCase();
  const categoryId = String(params.get('categoryId') ?? '').trim() || null;
  const barcode = String(params.get('barcode') ?? '').trim() || null;
  const rawQuery = normalizeCatalogQuery(params.get('q'));
  const query = isSearchableCatalogQuery(rawQuery) ? rawQuery : null;

  if (!barcode && !query && mode !== 'all' && !categoryId) {
    return { ok: false, error: 'categoryId, q, barcode, or mode=all is required' };
  }

  return {
    ok: true,
    options: {
      query,
      barcode,
      /**
       * Scope precedence, decided once, here.
       *
       * A barcode is an identity and a query searches the whole segment, so
       * both discard the category the operator happened to be drilled into.
       * Keeping it was the original defect: a walk-in asking for a product got
       * "no results" because the staffer was three categories deep. `mode=all`
       * likewise outranks a stale categoryId the client may still be holding.
       */
      categoryId: mode === 'all' || barcode || query ? null : categoryId,
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
