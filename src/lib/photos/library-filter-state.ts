/**
 * Photo library URL filter contract — shared by sidebar panel and main grid.
 *
 * Phase 1: URL is the single source of truth (`usePhotoLibraryUrlState`).
 * Phase 2: optional AI search mode via `searchMode=ask` (future).
 */

import { BUILTIN_IMAGE_TYPES } from '@/lib/photos/image-type-defs';
import {
  RECEIVING_PHOTO_STAGES,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import {
  addDaysToDateKey,
  diffDaysDateKey,
  formatDateKeyShort,
  getCurrentPSTDateKey,
  getRollingDaysStartKey,
  getYesterdayPSTDateKey,
} from '@/utils/date';

export interface PhotoLibraryFilterState {
  dateFrom?: string;
  dateTo?: string;
  sourceScope?: PhotoLibrarySourceScope;
  sort?: PhotoLibrarySortMode;
  poRef?: string;
  receivingId?: string;
  staffId?: string;
  q?: string;
  damageDetected?: string;
  hasAnalysis?: string;
  /** Selected custom image type (photo_image_types.key → photos.photo_type). */
  imageType?: string;
  /** Selected photo label (photo_labels.key → photo_label_assignments). */
  label?: string;
  /**
   * Unboxing evidence-stage sub-filter (arrival_package | unbox_carton |
   * unbox_item) — a navigator scope under the built-in `unboxing` folder, not a
   * structured refinement. Serialized only while the unboxing scope is active
   * so a stale stage never leaks into another scope's URL. Stage vocabulary SoT:
   * `src/lib/receiving/photo-intent.ts` / `src/lib/photos/stages.ts`.
   */
  stage?: ReceivingPhotoStage;
  /**
   * Business-ID filters — each resolves through `photo_entity_links` to a domain
   * table (see `src/lib/photos/queries/library.ts`). Stored as strings in the URL;
   * coerced to the right type at the route. All tenant-scoped.
   */
  tracking?: string;
  serial?: string;
  sku?: string;
  /** Zendesk claim ticket number (photo_entity_links ZENDESK_TICKET.entity_id). */
  ticketId?: string;
  /** Local pickup order id (local_pickup_orders.id). */
  pickupId?: string;
  /** Returns RMA number (rma_authorizations.rma_number). */
  rma?: string;
  /**
   * Unified PO-photo finder value — one identifier (order#, tracking#, serial#,
   * or PO#) resolved to its receiving carton, surfacing the whole PO's photos.
   * Paired with `poFinderKind` (defaults to 'po'). Fed by the sidebar search's
   * field-scope toggle. See `src/lib/photos/queries/library.ts` → poFinderExists.
   */
  poFinder?: string;
  poFinderKind?: PhotoFinderKind;
  /** Outbound scope only — filter to shipping_label, packing_slip, or all (omit). */
  documentType?: OutboundDocumentTypeFilter;
  /** Outbound scope — `pack_photos` shows PACKER_LOG photos instead of documents. */
  outboundMedia?: OutboundMediaFilter;
}

export type OutboundMediaFilter = 'documents' | 'pack_photos';

export type OutboundDocumentTypeFilter = 'shipping_label' | 'packing_slip' | 'all';

/**
 * Identifier kinds the unified PO-photo finder accepts. 'any' is the smart
 * scope: resolve the value as serial OR tracking OR order OR PO OR SKU OR
 * Zendesk ticket → matching photos, with a text/OCR fallback. The specific
 * kinds force one path.
 */
export type PhotoFinderKind = 'order' | 'tracking' | 'serial' | 'po' | 'sku' | 'ticket' | 'any';

/** Sidebar search field-scope. 'all' maps to the 'any' finder kind (smart
 *  resolve across every identifier + text/OCR); the rest force one kind. */
export type PhotoSearchField = 'all' | 'po' | 'order' | 'tracking' | 'serial' | 'sku' | 'ticket';

/** The finder kind a sidebar field-scope resolves to. */
export function finderKindForField(field: PhotoSearchField): PhotoFinderKind {
  return field === 'all' ? 'any' : field;
}

/** The sidebar field-scope a stored finder kind maps back to. */
export function fieldForFinderKind(kind: PhotoFinderKind | undefined): PhotoSearchField {
  return !kind || kind === 'any' ? 'all' : kind;
}

export const PHOTO_SEARCH_FIELDS: readonly PhotoSearchField[] = [
  'all',
  'ticket',
  'po',
  'order',
  'tracking',
  'serial',
  'sku',
];

export const PHOTO_SEARCH_FIELD_LABELS: Record<PhotoSearchField, string> = {
  all: 'All',
  ticket: 'Ticket #',
  po: 'PO #',
  order: 'Order #',
  tracking: 'Tracking #',
  serial: 'Serial #',
  sku: 'SKU',
};

/** First built-in media type — used when an operator explicitly picks Unboxing. */
export const DEFAULT_PHOTO_LIBRARY_MEDIA_SCOPE = BUILTIN_IMAGE_TYPES[0].key;

/**
 * Chrome recency tabs — Recent is the bare-load landing (all types, no date pin).
 *
 * There is deliberately **no `all` tab**: "all dates" and "recent" are the same
 * filter state (no date pin), so the two tabs produced byte-identical URLs and
 * `recencyTabFromFilters` resolved both back to `recent` — `All` was a tab that
 * could never light up. Clearing the date filter is `Recent`; the breadcrumb's
 * "All dates" crumb is the other way to reach it.
 */
export type PhotoLibraryRecencyTab = 'recent' | 'today' | 'last7';

export const PHOTO_LIBRARY_RECENCY_TABS: readonly PhotoLibraryRecencyTab[] = [
  'recent',
  'today',
  'last7',
];

export const PHOTO_LIBRARY_RECENCY_TAB_LABEL: Record<PhotoLibraryRecencyTab, string> = {
  recent: 'Recent',
  today: 'Today',
  last7: 'Last 7',
};

/** True when no explicit media type is pinned in the URL (bare or `sourceScope=all`). */
export function isPhotoLibraryMediaTypeUnset(filters: PhotoLibraryFilterState): boolean {
  if (filters.imageType) return false;
  const scope = filters.sourceScope;
  return !scope || scope === 'all';
}

/**
 * Bare-load landing — all media types, newest first, no date pin.
 * (Formerly pinned the first built-in scope + Today.)
 */
function defaultPhotoLibraryLandingPatch(): Partial<PhotoLibraryFilterState> {
  return {
    sourceScope: undefined,
    imageType: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    sort: 'recent',
    stage: undefined,
    poRef: undefined,
    label: undefined,
  };
}

/** @deprecated Prefer {@link defaultPhotoLibraryLandingPatch} — kept for call-site migrations. */
export function defaultPhotoLibraryMediaTypePatch(): Partial<PhotoLibraryFilterState> {
  return defaultPhotoLibraryLandingPatch();
}

/**
 * Map URL state → the active chrome recency tab, or `null` when **no tab owns
 * the current position**.
 *
 * The tabs are a 3-value projection of an arbitrary date range plus an entity
 * drill, so most positions have no tab. Returning `null` instead of guessing is
 * the whole point: the previous version mapped a `custom` range to `all` and
 * everything else (including `yesterday`) to `recent`, so the header claimed
 * "All" while the operator was four levels deep in
 * `2026 › June › Jun 15-21 › June 17`, and claimed "Recent" while sitting
 * inside a PO folder. The breadcrumb (`PhotoDateBreadcrumb`) is the SoT for
 * drill position; the tabs only report the three shortcuts they can express.
 */
export function recencyTabFromFilters(
  filters: PhotoLibraryFilterState,
): PhotoLibraryRecencyTab | null {
  // An entity leaf (PO / ticket / carton) or a live finder search is a position
  // no date tab represents.
  if (
    filters.poRef?.trim() ||
    filters.ticketId?.trim() ||
    filters.receivingId?.trim() ||
    filters.poFinder?.trim()
  ) {
    return null;
  }
  const preset = datePresetFromFilters(filters);
  if (preset === 'today') return 'today';
  if (preset === 'last7') return 'last7';
  if (preset === 'all') return 'recent';
  // 'yesterday' | 'custom' — a drill depth the tab strip cannot express.
  return null;
}

/**
 * Apply a chrome recency tab: set the date scope and drop any entity leaf.
 *
 * Clearing the leaf mirrors what the breadcrumb's date crumbs already do — a
 * date jump that left `poRef` pinned would keep the operator inside a PO folder
 * while lighting up a date tab, which is the same false-position bug in the
 * other direction. `poFinder` is left alone: the search box owns it, and
 * clearing it here would desync the input.
 */
export function applyRecencyTab(tab: PhotoLibraryRecencyTab): Partial<PhotoLibraryFilterState> {
  const clearLeaf = { poRef: undefined, ticketId: undefined, receivingId: undefined } as const;
  if (tab === 'today') return { ...applyDatePreset('today'), ...clearLeaf };
  if (tab === 'last7') return { ...applyDatePreset('last7'), ...clearLeaf };
  return { ...applyDatePreset('all'), ...clearLeaf, sort: 'recent' };
}

/**
 * Lifecycle facet tabs — the chrome's primary axis.
 *
 * These replaced the date recency tabs (Recent · Today · Last 7). Date is a
 * *filter*, not a lifecycle stage: every photo has a capture date, so a date tab
 * partitions nothing an operator reasons about, while "is this an unboxing shot
 * or a claim shot?" is the actual question asked of an evidence library. Date
 * still filters via the breadcrumb and the filter popover.
 *
 * Order is the physical flow of goods — inbound → handling → outbound → dispute:
 * All · Unboxing · Local pickups · Packing · Repair · Claims · Outbound.
 * `local_pickup` is included (the research ruling's 6-tab list omitted it)
 * because it is a first-class scope; leaving it out would have stranded it
 * behind the media-type menu while every sibling scope got a tab.
 */
export const PHOTO_LIBRARY_SCOPE_TABS: readonly PhotoLibrarySourceScope[] = [
  'all',
  'unboxing',
  'local_pickup',
  'packing',
  'repair',
  'claims',
  'outbound',
];

/** Compact tab labels — the sidebar/menu uses the longer PHOTO_SOURCE_SCOPE_LABELS. */
export const PHOTO_LIBRARY_SCOPE_TAB_LABEL: Record<PhotoLibrarySourceScope, string> = {
  all: 'All',
  unboxing: 'Unboxing',
  local_pickup: 'Pickups',
  packing: 'Packing',
  repair: 'Repair',
  claims: 'Claims',
  outbound: 'Outbound',
};

/**
 * Apply a lifecycle facet tab.
 *
 * Clears every scope-DEPENDENT filter, because those refinements are meaningless
 * (and actively misleading) under a different scope: `stage` only exists under
 * unboxing, `documentType` / `outboundMedia` only under outbound, and `label`
 * vocabularies are scoped per media type. Carrying one across would show an
 * empty result the operator cannot explain. Mirrors what the media-type menu
 * already does on scope switch.
 *
 * Scope-INDEPENDENT state deliberately survives: the date range, sort, and the
 * search box (`poFinder`) all mean the same thing under any scope — an operator
 * hunting one serial across lifecycle stages must be able to flip tabs without
 * retyping it. That is the core "search-first" job of the surface.
 */
export function applySourceScopeTab(
  scope: PhotoLibrarySourceScope,
): Partial<PhotoLibraryFilterState> {
  return {
    sourceScope: scope === 'all' ? undefined : scope,
    imageType: undefined,
    stage: undefined,
    label: undefined,
    // Entity leaves belong to the scope that produced them.
    poRef: undefined,
    ticketId: undefined,
    receivingId: undefined,
    // Outbound-only refinements — seeded when entering outbound, dropped otherwise.
    documentType: undefined,
    outboundMedia: scope === 'outbound' ? 'documents' : undefined,
  };
}

export function isPhotoFinderKind(value: string | null | undefined): value is PhotoFinderKind {
  return (
    value === 'order' ||
    value === 'tracking' ||
    value === 'serial' ||
    value === 'po' ||
    value === 'sku' ||
    value === 'ticket' ||
    value === 'any'
  );
}

/** Valid unboxing evidence-stage sub-filter value (`?stage=`). */
export function isPhotoLibraryStage(
  value: string | null | undefined,
): value is ReceivingPhotoStage {
  return (RECEIVING_PHOTO_STAGES as readonly string[]).includes(value ?? '');
}

/** Sidebar source folders — mapped to API entity types internally. */
export type PhotoLibrarySourceScope =
  | 'all'
  | 'unboxing'
  | 'local_pickup'
  | 'packing'
  | 'repair'
  | 'claims'
  | 'outbound';

export type PhotoLibraryDatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'custom';

export type PhotoLibrarySortMode = 'recent' | 'oldest';

export type PhotoLibraryViewMode = 'grid-sm' | 'grid-lg' | 'grid-ticket' | 'folders' | 'list';

/**
 * Canonical left→right view order. Single source for the `1` keyboard shortcut
 * for List (useMediaLibraryShortcuts) so the digit matches the on-screen order.
 * The header display toggle itself is the two-mode Icons/List segmented slider
 * in PhotoDisplayControls.
 */
export const PHOTO_LIBRARY_VIEW_ORDER: readonly PhotoLibraryViewMode[] = [
  'grid-sm',
  'grid-lg',
  'folders',
  'grid-ticket',
  'list',
];

/** Display modes in the second-header toggle (grid size lives on row 3). */
export const PHOTO_LIBRARY_HEADER_DISPLAY_MODES: readonly PhotoLibraryViewMode[] = ['list'];

/**
 * Keyboard shortcut target for display modes — currently List only (`1`).
 */
export function photoLibraryViewToggleModes(
  _view: PhotoLibraryViewMode,
  _folderIsLeaf: boolean,
): readonly PhotoLibraryViewMode[] {
  return PHOTO_LIBRARY_HEADER_DISPLAY_MODES;
}

/** Server page size for the library query (usePhotoLibrary requests this many per page). */
export const PHOTO_LIBRARY_PAGE_SIZE = 48;

/** Folders leaf contact sheet — newest N photos, then explicit Load more. */
export const PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE = 5;

export const PHOTO_SOURCE_SCOPE_LABELS: Record<PhotoLibrarySourceScope, string> = {
  all: 'All photos',
  unboxing: 'Unboxing',
  local_pickup: 'Local pickups',
  packing: 'Packing',
  repair: 'Repair services',
  claims: 'Zendesk Claims',
  outbound: 'Outbound',
};

export const OUTBOUND_DOCUMENT_TYPE_LABELS: Record<OutboundDocumentTypeFilter | 'pack_photos', string> = {
  all: 'All documents',
  shipping_label: 'Shipping labels',
  packing_slip: 'Packing slips',
  pack_photos: 'Pack photos',
};

export const PHOTO_ENTITY_TYPE_LABELS: Record<string, string> = {
  RECEIVING: 'Receiving',
  RECEIVING_LINE: 'Receiving line',
  PACKER_LOG: 'Packer',
  SERIAL_UNIT: 'Serial unit',
  ZENDESK_TICKET: 'Zendesk ticket',
};

export function sourceScopeFromFilters(filters: PhotoLibraryFilterState): PhotoLibrarySourceScope {
  return filters.sourceScope ?? 'all';
}

export function entityTypeForSourceScope(scope: PhotoLibrarySourceScope): string | undefined {
  switch (scope) {
    // Both unboxing and local pickup are RECEIVING-linked photos; they're split
    // apart by `receiving.source` (see `receivingSourceForScope`), not entity type.
    case 'unboxing':
    case 'local_pickup':
      return 'RECEIVING';
    case 'packing':
      return 'PACKER_LOG';
    // Repair photos flow through the serialized unit (testing + repair captures).
    case 'repair':
      return 'SERIAL_UNIT';
    case 'claims':
      return 'ZENDESK_TICKET';
    case 'outbound':
      return undefined;
    default:
      return undefined;
  }
}

export function isOutboundLibraryScope(scope: PhotoLibrarySourceScope | undefined): boolean {
  return scope === 'outbound';
}

/** The `receiving.source` value to scope to (`local_pickup`), or undefined. */
export function receivingSourceForScope(scope: PhotoLibrarySourceScope): string | undefined {
  return scope === 'local_pickup' ? 'local_pickup' : undefined;
}

/**
 * The `receiving.source` value to *exclude* for a scope. Unboxing means
 * "received goods that aren't local pickups", so it excludes the local-pickup
 * source — keeping the two receiving scopes disjoint in the sidebar.
 */
export function receivingSourceExcludeForScope(scope: PhotoLibrarySourceScope): string | undefined {
  return scope === 'unboxing' ? 'local_pickup' : undefined;
}

/**
 * Bare-load view — the flat reverse-chronological stream.
 *
 * Was `folders`, a Year › Month › Week › Day › PO drill that cost six clicks to
 * reach one photo, five of them pure calendar arithmetic. The hierarchy was a
 * filesystem metaphor over a relational table: photos have no disk directory, so
 * the folders were derived from `created_at` on every read. Worse, the default
 * made the landing state fetch **no photos at all** — `PhotoLibraryPage` gates
 * the photo query on `view !== 'folders' || foldersIsLeaf`, so a bare load
 * painted year tiles and the Recent tab could never show a photo.
 *
 * Calendar is now a *filter facet*, not a location. Reaching a given day is a
 * date filter, not a descent.
 */
export const DEFAULT_PHOTO_LIBRARY_VIEW: PhotoLibraryViewMode = 'grid-sm';

export function parsePhotoLibraryViewMode(raw: string | null): PhotoLibraryViewMode {
  if (
    raw === 'grid-sm' ||
    raw === 'grid-lg' ||
    raw === 'grid-ticket' ||
    raw === 'list' ||
    raw === 'folders'
  ) {
    return raw;
  }
  return DEFAULT_PHOTO_LIBRARY_VIEW;
}

function parseSourceScope(raw: string | null): PhotoLibrarySourceScope | undefined {
  if (
    raw === 'all' ||
    raw === 'unboxing' ||
    raw === 'local_pickup' ||
    raw === 'packing' ||
    raw === 'repair' ||
    raw === 'claims' ||
    raw === 'outbound'
  ) {
    return raw as PhotoLibrarySourceScope;
  }
  return undefined;
}

function parseDocumentTypeFilter(raw: string | null): OutboundDocumentTypeFilter | undefined {
  if (raw === 'shipping_label' || raw === 'packing_slip' || raw === 'all') return raw;
  return undefined;
}

export function datePresetFromFilters(filters: PhotoLibraryFilterState): PhotoLibraryDatePreset {
  const { dateFrom, dateTo } = filters;
  if (!dateFrom && !dateTo) return 'all';

  // Warehouse civil “today” — never host-local ymd(new Date()).
  const today = getCurrentPSTDateKey();
  const yesterday = getYesterdayPSTDateKey(today);

  if (dateFrom === today && dateTo === today) return 'today';
  if (dateFrom === yesterday && dateTo === yesterday) return 'yesterday';

  if (dateFrom && dateTo) {
    const diffDays = diffDaysDateKey(dateFrom, dateTo);
    const last7Start = getRollingDaysStartKey(7, today);
    if (diffDays === 6 && dateFrom === last7Start && dateTo === today) return 'last7';
  }

  return 'custom';
}

/** Optional date pin for folders browse (operators set Today / Last 7 / drills). */
export function todayFoldersDateFilter(): Pick<PhotoLibraryFilterState, 'dateFrom' | 'dateTo'> {
  const today = getCurrentPSTDateKey();
  return { dateFrom: today, dateTo: today };
}

export function applyDatePreset(preset: PhotoLibraryDatePreset): Pick<PhotoLibraryFilterState, 'dateFrom' | 'dateTo'> {
  if (preset === 'all') return { dateFrom: undefined, dateTo: undefined };
  const today = getCurrentPSTDateKey();
  if (preset === 'today') return { dateFrom: today, dateTo: today };
  if (preset === 'yesterday') {
    const d = addDaysToDateKey(today, -1);
    return { dateFrom: d, dateTo: d };
  }
  if (preset === 'last7') {
    return { dateFrom: getRollingDaysStartKey(7, today), dateTo: today };
  }
  return {};
}

export function formatPhotoLibraryDateRange(filters: PhotoLibraryFilterState): string {
  const preset = datePresetFromFilters(filters);
  if (preset === 'all') return 'All dates';
  if (preset === 'today') return 'Today';
  if (preset === 'yesterday') return 'Yesterday';
  if (preset === 'last7') return 'Last 7 days';
  if (filters.dateFrom && filters.dateTo) {
    const from = formatDateKeyShort(filters.dateFrom);
    const to = formatDateKeyShort(filters.dateTo);
    return filters.dateFrom === filters.dateTo ? from : `${from} to ${to}`;
  }
  if (filters.dateFrom) return `From ${formatDateKeyShort(filters.dateFrom)}`;
  if (filters.dateTo) return `Until ${formatDateKeyShort(filters.dateTo)}`;
  return 'Custom range';
}

export function parsePhotoLibraryFilters(params: URLSearchParams): PhotoLibraryFilterState {
  const next: PhotoLibraryFilterState = {};
  const set = (
    key:
      | 'dateFrom' | 'dateTo' | 'poRef' | 'receivingId' | 'staffId' | 'q'
      | 'damageDetected' | 'hasAnalysis' | 'imageType' | 'label'
      | 'tracking' | 'serial' | 'sku' | 'ticketId' | 'pickupId' | 'rma'
      | 'poFinder',
    param: string,
  ) => {
    const v = params.get(param)?.trim();
    if (v) next[key] = v;
  };
  set('dateFrom', 'dateFrom');
  set('dateTo', 'dateTo');
  set('imageType', 'imageType');
  set('label', 'label');
  const sourceScope = parseSourceScope(params.get('sourceScope'));
  if (sourceScope) next.sourceScope = sourceScope;
  const stage = params.get('stage')?.trim();
  if (isPhotoLibraryStage(stage)) next.stage = stage;
  const sort = params.get('sort');
  if (sort === 'recent' || sort === 'oldest') next.sort = sort as PhotoLibrarySortMode;
  set('poRef', 'poRef');
  set('receivingId', 'receivingId');
  set('staffId', 'staffId');
  set('tracking', 'tracking');
  set('serial', 'serial');
  set('sku', 'sku');
  set('ticketId', 'ticketId');
  set('pickupId', 'pickupId');
  set('rma', 'rma');
  set('poFinder', 'poFinder');
  const finderKind = params.get('poFinderKind')?.trim();
  if (isPhotoFinderKind(finderKind)) next.poFinderKind = finderKind;
  set('q', 'q');
  set('damageDetected', 'damageDetected');
  set('hasAnalysis', 'hasAnalysis');
  const documentType = parseDocumentTypeFilter(params.get('documentType'));
  if (documentType && documentType !== 'all') next.documentType = documentType;
  const outboundMedia = params.get('outboundMedia');
  if (outboundMedia === 'pack_photos') next.outboundMedia = 'pack_photos';
  return next;
}

export function parsePhotoLibraryDisplayParams(params: URLSearchParams): {
  view: PhotoLibraryViewMode;
  page: number;
  photoId: number | null;
} {
  const pageRaw = parseInt(params.get('page') ?? '1', 10);
  return {
    view: parsePhotoLibraryViewMode(params.get('view')),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    photoId: parsePhotoLibraryPhotoId(params.get('photoId')),
  };
}

/**
 * Inspected photo (`?photoId=`) — DISPLAY state, not a filter.
 *
 * It selects a record inside the current result set rather than narrowing that
 * set, so it lives beside `view`/`page` and is deliberately absent from
 * `PhotoLibraryFilterState`. Keeping it out of the filter bag matters: filters
 * are what a saved view snapshots and what resets the grid, and neither should
 * happen because someone opened an inspector.
 *
 * Negative ids are legal — an outbound document row carries the negated
 * `documents.id` (see `libraryDocumentId`) — so only 0 and non-numerics are
 * rejected.
 */
export function parsePhotoLibraryPhotoId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id !== 0 ? id : null;
}

export function photoLibraryFiltersToParams(
  filters: PhotoLibraryFilterState,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? '');
  const keys: (keyof PhotoLibraryFilterState)[] = [
    'dateFrom',
    'dateTo',
    'poRef',
    'receivingId',
    'staffId',
    'tracking',
    'serial',
    'sku',
    'ticketId',
    'pickupId',
    'rma',
    'poFinder',
    'poFinderKind',
    'q',
    'damageDetected',
    'hasAnalysis',
    'imageType',
    'label',
    'documentType',
    'outboundMedia',
  ];
  if (filters.sourceScope && filters.sourceScope !== 'all') {
    params.set('sourceScope', filters.sourceScope);
  } else {
    params.delete('sourceScope');
  }
  // The stage sub-filter is meaningful only under the Unboxing folder — dropping
  // it here (rather than trusting every scope-switch call site to clear it)
  // guarantees a stale stage never rides into another scope's deep link.
  if (filters.stage && filters.sourceScope === 'unboxing') {
    params.set('stage', filters.stage);
  } else {
    params.delete('stage');
  }
  if (filters.sort && filters.sort !== 'recent') params.set('sort', filters.sort);
  else params.delete('sort');
  for (const key of keys) {
    const val = filters[key]?.trim();
    if (val) params.set(key, val);
    else params.delete(key);
  }
  return params;
}

export function photoLibraryUrlParams(
  filters: PhotoLibraryFilterState,
  display: { view: PhotoLibraryViewMode; page: number; photoId?: number | null },
  base?: URLSearchParams,
): URLSearchParams {
  const params = photoLibraryFiltersToParams(filters, base);
  // Omit the DEFAULT view, not a hardcoded mode — these two must stay in lockstep
  // with `parsePhotoLibraryViewMode` or the round-trip breaks in both directions:
  // a bare load would serialize a redundant `?view=`, and the old default would
  // parse back to something the URL never said.
  if (display.view !== DEFAULT_PHOTO_LIBRARY_VIEW) params.set('view', display.view);
  else params.delete('view');
  if (display.page > 1) params.set('page', String(display.page));
  else params.delete('page');
  if (display.photoId) params.set('photoId', String(display.photoId));
  else params.delete('photoId');
  return params;
}

export function countActivePhotoLibraryFilters(filters: PhotoLibraryFilterState): number {
  let n = 0;
  if (filters.staffId) n++;
  if (filters.poFinder) n++;
  if (filters.label) n++;
  if (filters.damageDetected) n++;
  if (filters.hasAnalysis) n++;
  return n;
}

export function clearStructuredPhotoFilters(
  filters: PhotoLibraryFilterState,
): PhotoLibraryFilterState {
  return {
    ...filters,
    dateFrom: undefined,
    dateTo: undefined,
    poRef: undefined,
    receivingId: undefined,
    staffId: undefined,
    tracking: undefined,
    serial: undefined,
    sku: undefined,
    ticketId: undefined,
    pickupId: undefined,
    rma: undefined,
    poFinder: undefined,
    poFinderKind: undefined,
    label: undefined,
    damageDetected: undefined,
    hasAnalysis: undefined,
  };
}
