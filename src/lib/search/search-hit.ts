/**
 * SearchHit — the single tool-calling-friendly result shape every AI-search
 * consumer (CommandBar, /api/ai/retrieve, chat tools, future agents) renders.
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

export type SearchHitEntityType = 'order' | 'unit' | 'receiving' | 'sku' | 'repair' | 'fba';

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
};

const UI_TO_DB: Record<SearchHitEntityType, SearchEntityType> = {
  order: 'ORDER',
  unit: 'SERIAL_UNIT',
  receiving: 'RECEIVING',
  sku: 'SKU',
  repair: 'REPAIR',
  fba: 'FBA_SHIPMENT',
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
 * There is exactly ONE order shell: `/o/[orderId]` ({@link orderRecordHref}).
 * A search hit for an order deep-links there like every other opener does —
 * recents (`detailStackHref`), ⌘K, and the order rail already did. The former
 * `orderSearchHref` built a third one (`/dashboard?mode=search&openOrderId=`,
 * a mode-local detail shell beside the slide-in panel and the full page); it
 * was deleted with Search mode (`docs/todo/dashboard-ia-rework-PLAN.md` X9a).
 */

/**
 * The cross-entity search surface's route. One constant so the two builders
 * below cannot drift (it used to be a `/dashboard` mode spelled out in ~10
 * places). Deliberately NOT exported: callers compose {@link globalSearchHref}
 * rather than re-assembling the path, and an unused export fails the knip gate.
 */
const SEARCH_SURFACE_PATH = '/search';

/** Canonical order-record href (`/o/[orderId]`) — the full order Workbench. */
export function orderRecordHref(orderId: string | number): string {
  return `/o/${encodeURIComponent(String(orderId).trim())}`;
}

export function searchHitHref(dbType: SearchEntityType, entityId: number): string {
  switch (dbType) {
    case 'ORDER':
      // The one order shell. Shipping-mode slide-over stays the in-place board
      // experience; search / ⌘K / recents always land on the record page.
      // Keep in sync with global-entity-search.ts.
      return orderRecordHref(entityId);
    case 'SERIAL_UNIT':
      return `/inventory/units?unit=${entityId}`;
    case 'RECEIVING':
      // The READ view (plan D4). This used to be `/unbox?openReceivingId=`,
      // which meant every search hit — and every sole-hit auto-open — dropped
      // the operator into the WORK editor, the exact surface a lookup is trying
      // to avoid. `/unbox` is still one click away from the inspector.
      return `/carton/${entityId}`;
    case 'SKU':
      return `/products?view=qc&skuId=${entityId}`;
    case 'REPAIR':
      return `/repair?tab=active&openRepair=${entityId}`;
    case 'FBA_SHIPMENT':
      return `/fba?openShipmentId=${entityId}`;
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
  const q = query.trim();
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
 * unusable id, or an entity vocabulary this build does not know. Orders need no
 * special case any more: `searchHitHref('ORDER')` IS the order record page.
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
 * **exactly one ORDER** whose display identity contains the query (human order
 * # lives in subtitle; numeric pk may match `id`). Other entity types
 * (receiving PO siblings, units) are ignored — eBay-style ids often return
 * ORDER + RECEIVING together; that must still open the order.
 *
 * Returns null for Zoho PO / multi-order / true miss — callers must fall
 * through to the cross-entity results list, never force a dead `openOrderId`.
 */
export function soleMatchingOrderHit(
  hits: ReadonlyArray<SoleOrderMatchHit>,
  query: string,
): { id: number } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const matched = hits.filter((hit) => {
    if (hit.entityType !== 'order' || !Number.isFinite(hit.id) || hit.id <= 0) return false;
    if (String(hit.id) === q) return true;
    const hay = [hit.subtitle, hit.title, hit.facets?.order_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  if (matched.length === 1) return { id: matched[0].id };
  return null;
}

/**
 * Header Enter / "See all" handoff.
 *
 * D4a — confidence decides the destination:
 *   • identifier query resolving to **exactly one** ORDER → `/o/[id]`, the
 *     canonical record. Typing a full order number is unambiguous intent; a
 *     results list of one is a failure to recognize it.
 *   • identifier with several ORDER hits, or no ORDER hit at all (receiving PO /
 *     tracking / serial may match other entities) → Search results list with the
 *     hit-map rail. Never force `openOrderId`, which dead-ends on "not found".
 *   • cross-entity natural language → results list.
 *
 * Journey Trace stays a **secondary** action (`journeyHandoffHref` / ⌘Enter) —
 * never the Enter default.
 */
export function globalSearchHandoffHref(
  query: string,
  previewHits: ReadonlyArray<{ id: number; entityType: string }> = [],
): string {
  const trimmed = query.trim();
  if (!trimmed) return SEARCH_SURFACE_PATH;
  const orderHits = previewHits.filter((h) => h.entityType === 'order');
  const orderOnly =
    previewHits.length > 0 && previewHits.every((h) => h.entityType === 'order');
  const isIdentifier = looksLikeIdentifier(trimmed);

  // One confident hit → the record itself.
  if (isIdentifier && orderHits.length === 1) return orderRecordHref(orderHits[0].id);

  if (isIdentifier || orderOnly) {
    const top = orderHits[0];
    if (top) return orderRecordHref(top.id);
    return globalSearchHref(trimmed);
  }
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
      return `/dashboard?search=${q}`;
    case 'SERIAL_UNIT':
      return `/inventory/units?q=${q}`;
    case 'SKU':
      return `/inventory/skus?q=${q}`;
    default:
      return null; // RECEIVING / REPAIR / FBA_SHIPMENT: no URL-searchable list yet
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
