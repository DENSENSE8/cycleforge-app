/**
 * SearchHit — the single tool-calling-friendly result shape every AI-search
 * consumer (CommandBar, global-search, chat tools, future agents) renders.
 *
 * STRICT SUPERSET of global-search's SearchResult
 * (`{ id, entityType, title, subtitle, href, matchField }`) so CommandBar and
 * existing consumers keep working with minimal change; the additions are
 * `score`, `chips[]`, and optional `facets`/`actions`.
 *
 * Vocabulary note — two discriminator layers, one mapping (here, nowhere else):
 *   DB (entity_search_docs.entity_type, uppercase):
 *     ORDER | SERIAL_UNIT | RECEIVING | SKU | REPAIR | FBA_SHIPMENT
 *   UI (SearchHit.entityType, lowercase — matches global-search + ENTITY_ICONS):
 *     order | unit | receiving | sku | repair | fba
 */

import type { SearchEntityType } from '@/lib/search/build-search-text';
import { getLast8 } from '@/lib/copy-chip-format';
import {
  buildOrderJourneyHref,
  buildSerialJourneyHref,
  buildTrackingJourneyHref,
  buildUnitJourneyHref,
} from '@/lib/serial/serial-journey';
import { orderNumberEqualsQuery } from '@/lib/search/order-number-match';

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

/**
 * Standards identifiers for a hit, when it has any.
 *
 * Optional and usually absent. This exists so an external agent or a partner's
 * system can reconcile a Cycle Forge record against its own by a key BOTH
 * sides recognise, without this repo growing a second search engine — the
 * AGENTS.md hard law ("never build a second search engine") is not relaxed by
 * the word "interop".
 *
 * `internal` is always present, `gs1` only when the record really resolves to
 * a licensed GS1 key. The split is the whole point: a consumer can trust
 * anything under `gs1` as globally resolvable and must treat `internal` as
 * meaningful only to this tenant. Populate via `@/lib/interop/gs1-keys`;
 * never hand-format either string at a call site.
 */
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

/**
 * Deep-link per entity — mirrors the hrefs global-search already emits so a
 * hit opens the same surface regardless of which engine produced it.
 * SERIAL_UNIT uses the inventory workbench's `?unit=` view (ByUnitView →
 * /api/serial-units/:id, which accepts the numeric id).
 *
 * Orders have two destinations by job:
 *   • Shareable / Find / threads → {@link searchOrderFeedbackHref} (`/search?sel=order:…`)
 *   • Desk durable edit → `/shipping/orders?openOrderId=` (`dashboardOrderHref`)
 * {@link orderRecordHref} is a thin alias of search feedback (`/o` is retired).
 * Desk table row click keeps the right-rail `ShippedDetailsPanel` (tabbed).
 */

/**
 * The cross-entity search surface's route. One constant so the two builders
 * below cannot drift (it used to be a `/dashboard` mode spelled out in ~10
 * places). Deliberately NOT exported: callers compose {@link globalSearchHref}
 * rather than re-assembling the path, and an unused export fails the knip gate.
 */
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

export function searchHitHref(dbType: SearchEntityType, entityId: number): string {
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
      // Support ▸ Warranty reads the claim id off `?open=`
      // (query-mode-routes.ts:151, useWarrantyClaims.ts:36).
      return `/support?mode=warranty&open=${entityId}`;
    case 'SUPPORT_TICKET':
      // Tickets is Support's DEFAULT mode, so `?ticket=` alone lands there
      // (useSupportTicketParam.ts:29,37). The value is support_tickets.id —
      // resolveSupportContext probes the PK first, provider id second
      // (src/lib/support/context.ts:117-133).
      return `/support?ticket=${entityId}`;
    case 'LOCATION':
      // Inventory ▸ Locations ▸ Bins — the live list surface
      // (locations-path.ts:10-19, INVENTORY_LOCATIONS_ROUTE_PARAMS
      // query-mode-routes.ts:510-527).
      //
      // NAMED GAP, not a fabricated param: every bin RECORD surface in the app
      // is keyed by BARCODE, never by locations.id — `?bin=` feeds
      // LocationDetailView's barcode fetch (`/api/locations/[barcode]`,
      // ByBinView.tsx:19-25) and `/l/[ref]` resolves barcode-or-name only. This
      // signature carries an id, so the honest destination is the Bins tab that
      // lists the record rather than `?loc=<id>`, which no parser reads and
      // which route-param hygiene would reject.
      return '/inventory/locations?tab=bins';
  }
}

/**
 * Identifier heuristic for the exact bypass: serial / tracking / order-id /
 * numeric-id shaped input (no spaces, digit-bearing token or a pure id).
 * Natural-language queries fall through to the hybrid arms. Lives in this
 * pure module (not hybrid-retrieval) so the client — CommandBar skips its
 * redundant global-search fetch for identifier queries — can import it
 * without pulling the server-only pool/tenancy graph into the bundle.
 */
export function looksLikeIdentifier(query: string): boolean {
  const q = String(query ?? '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-');
  if (!q || /\s/.test(q)) return false;
  if (/^\d{3,}$/.test(q)) return true; // bare numeric id / tracking fragment
  // Alphanumeric token with digits (serials, FNSKUs, order ids, LPNs, RS-#).
  return /^[A-Za-z0-9#:_\-\.\/]+$/.test(q) && /\d{2,}/.test(q) && q.length >= 4;
}

/**
 * Narrow-rail title display (header dropdown + sidebar AI matches). Long
 * tracking/PO/serial-shaped titles share a prefix and truncate to identical
 * `94…` crumbs — show last-8 instead and keep the full value for a tooltip.
 * Product titles (spaces) and short ids stay intact.
 */
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

/**
 * Map a search hit → Operations ▸ History Trace when a journey dimension can
 * be resolved. Returns null when no Trace anchor exists — callers must not
 * open an empty Trace (action simply does not render).
 *
 * Unit hits use `dim=unit&unit={id}` (server resolves serial_units.id) so we
 * never depend on a serial facet / search-index backfill.
 */
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

/**
 * Sole-result auto-open, ANY entity type — the destination for a settled list
 * of exactly one hit.
 *
 * {@link shouldAutoOpenSearchOrder} only ever covered orders, so a search that
 * resolved to a single receiving carton / unit / repair still parked the
 * operator on a one-row list they had to click. One row is not a choice.
 *
 * Returns null for 0 or 2+ hits (a real list — never force a destination), an
 * unusable id, or an entity vocabulary this build does not know. ORDER hits
 * open search feedback via {@link searchHitHref}.
 */
export function soleHitHref(
  hits: ReadonlyArray<{ id: number; entityType: string }>,
): string | null {
  if (hits.length !== 1) return null;
  const hit = hits[0];
  if (!hit || !Number.isFinite(hit.id) || hit.id <= 0) return null;
  if (!isUiEntityType(hit.entityType)) return null;
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

/**
 * Identifier lookup miss → retrieve bridge: auto-open when retrieve settled to
 * **exactly one ORDER** whose marketplace order # equals the query (dash-
 * insensitive; last-8 when the paste has ≥8 digits). Numeric `orders.id` is
 * not an order number.
 *
 * Returns null for Zoho PO / multi-order / true miss — callers must fall
 * through to the cross-entity results list, never force a dead `openOrderId`.
 */
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

/**
 * Header Enter / "See all" handoff.
 *
 * Confidence decides the destination:
 *   • identifier query resolving to **exactly one** ORDER → search feedback
 *     (`/search?sel=order:…`). Typing a full order number is unambiguous intent.
 *   • otherwise → Search results (ORDER preview hits also open feedback via
 *     {@link searchHitHref} / {@link searchOrderFeedbackHref}).
 *
 * Journey Trace stays a **secondary** action (`journeyHandoffHref` / ⌘Enter) —
 * never the Enter default. Durable edit stays on the desk inspector.
 */
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

/**
 * AI-suggested filter application (plan §8.4, Phase 3): map an entity scope +
 * distilled query to the LIST SURFACE that can show "all matches" with the
 * query applied as its own URL filter — the Ask-AI path's toolArgs become a
 * real table/workbench filter, not just a hit list. Param names are each
 * surface's existing URL-state contract (dashboard `?search=`, inventory
 * `?q=`). Types without a URL-searchable list surface return null — the
 * action simply doesn't render (never a dead link).
 */
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
      // Tickets is Support's default mode; the board reads its OWN search key
      // off the URL (SupportTicketsBoard.tsx:98 `searchParams.get('tq')`).
      return `/support?tq=${q}`;
    case 'LOCATION':
      // `/inventory/locations` owns `q` on its own longer-prefix route spec
      // (query-mode-routes.ts:512-525), and the Bins tab filters on it — so
      // unlike the hit href, the SCOPE href is a real applied filter.
      return `/inventory/locations?tab=bins&q=${q}`;
    default:
      // RECEIVING / REPAIR / FBA_SHIPMENT: no URL-searchable list yet.
      // WARRANTY_CLAIM deliberately joins them: `/support?mode=warranty&search=`
      // feeds only the coverage-lookup CARD (WarrantyWorkspace.tsx:23); the
      // claims table's own search box is local state
      // (useWorkbenchSearchParam.ts:18), so that href would not filter the list.
      return null;
  }
}

/**
 * The GLOBAL cross-entity search surface with a query pre-applied.
 *
 * Distinct from {@link searchScopeHref}, which narrows to one entity's list
 * surface and returns null for the types that have none (RECEIVING among them).
 * This is the "just search for this string" jump: `/search` runs hybrid
 * retrieval across every entity, so a PO number resolves to its carton, its
 * order, and its units without the caller knowing which surface owns them.
 *
 * It is its OWN route rather than a `/dashboard` mode: cross-entity results are
 * not the outbound order workbench with a different filter, and the `?warranty=`
 * precedent already showed the house answer for a surface that outgrew a mode.
 */
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
