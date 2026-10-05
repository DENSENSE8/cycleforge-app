/** SearchHit — the single tool-calling-friendly result shape every AI-search consumer (CommandBar, global-search, chat tools, future… */

import type { SearchEntityType } from '@/lib/search/build-search-text';
import { getLast8 } from '@/lib/copy-chip-format';
import {
  buildOrderJourneyHref,
  buildSerialJourneyHref,
  buildTrackingJourneyHref,
  buildUnitJourneyHref,
} from '@/lib/serial/serial-journey';
import { orderNumberEqualsQuery } from '@/lib/search/order-number-match';
import { supportHref } from '@/lib/nav/route-tree';

export type SearchHitEntityType =
  | 'order'
  | 'unit'
  | 'receiving'
  | 'sku'
  | 'repair'
  | 'fba'
  | 'warranty'
  | 'ticket'
  | 'location';

export interface SearchHitChip {
  label: string;
  /** Semantic tone key — rendered via existing chip conventions, never a hex. */
  tone?: 'gray' | 'blue' | 'emerald' | 'amber' | 'rose';
}

export interface SearchHitAction {
  type: string;
  label: string;
  payload: unknown;
}

/** Standards identifiers for a hit, when it has any. */
export interface SearchHitIdentifiers {
  /** `urn:cycleforge:{kind}:{value}` — always available. */
  internal: string;
  /** A real GS1 EPC URI (SGTIN / GTIN / GLN). Absent unless licensed. */
  gs1?: string;
}

export interface SearchHit {
  id: number;
  entityType: SearchHitEntityType;
  title: string;
  subtitle: string;
  href: string;
  matchField: string;
  score: number;
  chips: SearchHitChip[];
  /** Machine-readable facet values for follow-up filtering/tool calls. */
  facets?: Record<string, string | null>;
  actions?: SearchHitAction[];
  /**
   * Standards identifiers, when the record has them. Additive and optional —
   * a hit without them behaves exactly as before, which is what keeps this a
   * FIELD on the existing shape rather than a parallel result type.
   */
  identifiers?: SearchHitIdentifiers;
}

const DB_TO_UI: Record<SearchEntityType, SearchHitEntityType> = {
  ORDER: 'order',
  SERIAL_UNIT: 'unit',
  RECEIVING: 'receiving',
  SKU: 'sku',
  REPAIR: 'repair',
  FBA_SHIPMENT: 'fba',
  WARRANTY_CLAIM: 'warranty',
  SUPPORT_TICKET: 'ticket',
  LOCATION: 'location',
};

const UI_TO_DB: Record<SearchHitEntityType, SearchEntityType> = {
  order: 'ORDER',
  unit: 'SERIAL_UNIT',
  receiving: 'RECEIVING',
  sku: 'SKU',
  repair: 'REPAIR',
  fba: 'FBA_SHIPMENT',
  warranty: 'WARRANTY_CLAIM',
  ticket: 'SUPPORT_TICKET',
  location: 'LOCATION',
};

export function toUiEntityType(dbType: SearchEntityType): SearchHitEntityType {
  return DB_TO_UI[dbType];
}

export function toDbEntityType(uiType: SearchHitEntityType): SearchEntityType {
  return UI_TO_DB[uiType];
}

export function isUiEntityType(value: string): value is SearchHitEntityType {
  return value in UI_TO_DB;
}

/** Deep-link per entity — mirrors the hrefs global-search already emits so a hit opens the same surface regardless of which engine produced it. */

/** The cross-entity search surface's route. */
const SEARCH_SURFACE_PATH = '/search';

/**
 * Shareable order href — alias of {@link searchOrderFeedbackHref}.
 * `/o/[id]` is retired; bookmarks redirect there via the app route.
 */
export function orderRecordHref(orderId: string | number): string {
  return searchOrderFeedbackHref(orderId);
}

/**
 * Search order feedback href — `/search?sel=order:{id}`.
 * Mounts {@link SearchOrderFeedback} (read-only). Durable edit lives on desk.
 */
export function searchOrderFeedbackHref(orderId: string | number): string {
  const id = encodeURIComponent(String(orderId).trim());
  return `${SEARCH_SURFACE_PATH}?sel=order:${id}`;
}

/** The SKU record page (`SkuDetailView`) — where the SKU arm's hits open. */
export const SKU_RECORD_PATH_PREFIX = '/inventory?sku=';

export function skuRecordHref(sku: string): string {
  return `${SKU_RECORD_PATH_PREFIX}${encodeURIComponent(sku)}`;
}

/** The desktop tote record (`/tote/{id}`) — a tote hit and a scanned `H-{id}` plate land here. */
export function toteRecordHref(id: number): string {
  return `/tote/${id}`;
}

/**
 * The record surface a hit opens. SUPPORT_TICKET hits open the Support item
 * (`entityId` = support_tickets.id) on /support.
 */
export function searchHitHref(
  dbType: SearchEntityType,
  entityId: number,
): string {
  switch (dbType) {
    case 'ORDER':
      // Search feedback shell. Keep in sync with global-entity-search.ts.
      return searchOrderFeedbackHref(entityId);
    case 'SERIAL_UNIT':
      return `/inventory/units?unit=${entityId}`;
    case 'RECEIVING':
      return `/search?sel=receiving:${entityId}`;
    case 'SKU':
      return `/products?view=qc&skuId=${entityId}`;
    case 'REPAIR':
      return `/repair?tab=active&openRepair=${entityId}`;
    case 'FBA_SHIPMENT':
      return `/fba?openShipmentId=${entityId}`;
    case 'WARRANTY_CLAIM':
      return supportHref();
    case 'SUPPORT_TICKET':
      return supportHref({ item: entityId });
    case 'LOCATION':
      // Inventory ▸ Locations ▸ Bins — the live list surface (locations-path.ts:10-19, INVENTORY_LOCATIONS_ROUTE_PARAMS…
      return '/inventory/locations?tab=bins';
  }
}

/** Identifier heuristic for the exact bypass: */
export function looksLikeIdentifier(query: string): boolean {
  const q = String(query ?? '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-');
  if (!q || /\s/.test(q)) return false;
  if (/^\d{3,}$/.test(q)) return true; // bare numeric id / tracking fragment
  // Alphanumeric token with digits (serials, FNSKUs, order ids, LPNs, RS-#).
  return /^[A-Za-z0-9#:_\-\.\/]+$/.test(q) && /\d{2,}/.test(q) && q.length >= 4;
}

/** Narrow-rail title display (header dropdown + sidebar AI matches). */
interface NarrowSearchTitleDisplay {
  display: string;
  full: string;
  abbreviated: boolean;
}

/** Min length before an identifier-shaped title is abbreviated to last-8. */
const NARROW_ID_TITLE_MIN = 12;

export function narrowSearchTitleDisplay(title: string): NarrowSearchTitleDisplay {
  const full = String(title ?? '').trim();
  if (!full) return { display: title ?? '', full: title ?? '', abbreviated: false };
  // Product / prose titles have spaces — never crush them to last-8.
  if (/\s/.test(full)) return { display: full, full, abbreviated: false };
  if (!looksLikeIdentifier(full) || full.length < NARROW_ID_TITLE_MIN) {
    return { display: full, full, abbreviated: false };
  }
  return { display: getLast8(full), full, abbreviated: true };
}

/**
 * Minimal hit shape for journey handoff — works with SearchHit and AiSearchHit.
 */
type JourneyHandoffHit = {
  id: number;
  entityType: string;
  facets?: Record<string, string | null> | null;
};

/** Map a search hit → Operations ▸ History Trace when a journey dimension can be resolved. */
export function journeyHandoffHref(hit: JourneyHandoffHit): string | null {
  const facets = hit.facets ?? undefined;
  switch (hit.entityType) {
    case 'order':
      return buildOrderJourneyHref(hit.id);
    case 'unit':
      return buildUnitJourneyHref(hit.id);
    case 'receiving': {
      const tracking = facets?.tracking_number?.trim();
      return tracking ? buildTrackingJourneyHref(tracking) : null;
    }
    case 'repair': {
      const serial = facets?.serial_number?.trim();
      return serial ? buildSerialJourneyHref(serial) : null;
    }
    default: {
      // Any other entity that carries a tracking facet can still open Trace.
      const tracking = facets?.tracking_number?.trim();
      return tracking ? buildTrackingJourneyHref(tracking) : null;
    }
  }
}

/**
 * Exact / only ORDER match — auto-open Search order detail from Overview or
 * the L2 hit map. True only when the settled list is a single order hit
 * (not "top of many"). Shared by DashboardSearchView + DashboardSearchSidebar.
 */
export function shouldAutoOpenSearchOrder(
  hits: ReadonlyArray<{ entityType: string }>,
): boolean {
  return hits.length === 1 && hits[0]?.entityType === 'order';
}

/** Sole-result auto-open, ANY entity type — the destination for a settled list of exactly one hit. */
export function soleHitHref(
  hits: ReadonlyArray<{ id: number; entityType: string; href?: string }>,
): string | null {
  if (hits.length !== 1) return null;
  const hit = hits[0];
  if (!hit || !Number.isFinite(hit.id) || hit.id <= 0) return null;
  if (!isUiEntityType(hit.entityType)) return null;
  // A Support hit's href carries its task (looked up at retrieval); the id alone cannot.
  if (hit.entityType === 'ticket' && hit.href) return hit.href;
  return searchHitHref(toDbEntityType(hit.entityType), hit.id);
}

/** Minimal hit fields used to confirm a sole ORDER matches an identifier query. */
type SoleOrderMatchHit = {
  id: number;
  entityType: string;
  title?: string;
  subtitle?: string;
  facets?: Record<string, string | null> | null;
};

/** Identifier lookup miss → retrieve bridge: */
export function soleMatchingOrderHit(
  hits: ReadonlyArray<SoleOrderMatchHit>,
  query: string,
): { id: number } | null {
  const q = query.trim();
  if (!q) return null;

  const matched = hits.filter((hit) => {
    if (hit.entityType !== 'order' || !Number.isFinite(hit.id) || hit.id <= 0) return false;
    const orderId =
      hit.facets?.order_id?.trim() ||
      String(hit.subtitle ?? '')
        .split('·')[0]
        ?.trim() ||
      null;
    return orderNumberEqualsQuery(orderId, q);
  });

  if (matched.length === 1) return { id: matched[0].id };
  return null;
}

/** Header Enter / "See all" handoff. */
export function globalSearchHandoffHref(
  query: string,
  previewHits: ReadonlyArray<{ id: number; entityType: string }> = [],
): string {
  const trimmed = query.trim();
  if (!trimmed) return SEARCH_SURFACE_PATH;
  const orderHits = previewHits.filter((h) => h.entityType === 'order');
  const isIdentifier = looksLikeIdentifier(trimmed);

  // One confident hit → search order feedback.
  if (isIdentifier && orderHits.length === 1) return searchOrderFeedbackHref(orderHits[0].id);

  return globalSearchHref(trimmed);
}

/** AI-suggested filter application (plan §8.4, Phase 3): */
export function searchScopeHref(dbType: SearchEntityType, query: string): string | null {
  const q = encodeURIComponent(query.trim());
  if (!q) return null;
  switch (dbType) {
    case 'ORDER':
      return `/shipping/orders?search=${q}`;
    case 'SERIAL_UNIT':
      return `/inventory/units?q=${q}`;
    case 'SKU':
      return `/inventory/skus?q=${q}`;
    case 'SUPPORT_TICKET':
      return supportHref({ q: query });
    case 'LOCATION':
      // `/inventory/locations` owns `q` on its own longer-prefix route spec
      // (query-mode-routes.ts:512-525), and the Bins tab filters on it — so
      // unlike the hit href, the SCOPE href is a real applied filter.
      return `/inventory/locations?tab=bins&q=${q}`;
    default:
      // RECEIVING / REPAIR / FBA_SHIPMENT:
      return null;
  }
}

/** The GLOBAL cross-entity search surface with a query pre-applied. */
export function globalSearchHref(query: string): string {
  const q = encodeURIComponent(query.trim());
  return q ? `${SEARCH_SURFACE_PATH}?q=${q}` : SEARCH_SURFACE_PATH;
}

/** Human label for the surface searchScopeHref targets (UI action rows). */
export function searchScopeLabel(dbType: SearchEntityType): string | null {
  switch (dbType) {
    case 'ORDER':
      return 'Shipped orders';
    case 'SERIAL_UNIT':
      return 'Inventory units';
    case 'SKU':
      return 'SKU catalog';
    case 'SUPPORT_TICKET':
      return 'Support tickets';
    case 'LOCATION':
      return 'Bins';
    default:
      return null;
  }
}

/** Chip tones keyed by facet kind — semantic families only (house chip rule). */
export function facetChips(facets: {
  status?: string | null;
  conditionGrade?: string | null;
  sourcePlatform?: string | null;
}): SearchHitChip[] {
  const chips: SearchHitChip[] = [];
  if (facets.status) chips.push({ label: facets.status, tone: 'blue' });
  if (facets.conditionGrade) chips.push({ label: facets.conditionGrade, tone: 'amber' });
  if (facets.sourcePlatform) chips.push({ label: facets.sourcePlatform, tone: 'gray' });
  return chips;
}
