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
  /** Unboxing evidence-stage sub-filter (arrival_package | unbox_carton | unbox_item) — a navigator scope under the built-in `unboxing`… */
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
  /** Unified PO-photo finder value — one identifier (order#, tracking#, serial#, or PO#) resolved to its receiving carton, surfacing the… */
  poFinder?: string;
  poFinderKind?: PhotoFinderKind;
  /** Outbound scope only — filter to shipping_label, packing_slip, or all (omit). */
  documentType?: OutboundDocumentTypeFilter;
  /** Outbound scope — `pack_photos` shows PACKER_LOG photos instead of documents. */
  outboundMedia?: OutboundMediaFilter;
}

export type OutboundMediaFilter = 'documents' | 'pack_photos';

export type OutboundDocumentTypeFilter = 'shipping_label' | 'packing_slip' | 'all';

/** Identifier kinds the unified PO-photo finder accepts. */
export type PhotoFinderKind = 'order' | 'tracking' | 'serial' | 'po' | 'sku' | 'ticket' | 'repair' | 'customer' | 'any';

/** Sidebar search field-scope. 'all' maps to the 'any' finder kind (smart
 *  resolve across every identifier + text/OCR); the rest force one kind. */
export type PhotoSearchField = 'all' | 'po' | 'order' | 'tracking' | 'serial' | 'sku' | 'ticket' | 'repair' | 'customer';

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
  'repair',
  'customer',
  'po',
  'order',
  'tracking',
  'serial',
  'sku',
];

export const PHOTO_SEARCH_FIELD_LABELS: Record<PhotoSearchField, string> = {
  all: 'All',
  ticket: 'Ticket #',
  repair: 'Repair',
  customer: 'Customer',
  po: 'PO #',
  order: 'Order #',
  tracking: 'Tracking #',
  serial: 'Serial #',
  sku: 'SKU',
};

/** First built-in media type — used when an operator explicitly picks Unboxing. */
export const DEFAULT_PHOTO_LIBRARY_MEDIA_SCOPE = BUILTIN_IMAGE_TYPES[0].key;

// The chrome recency tabs (Recent · Today · Last 7) were REMOVED when the tab strip became lifecycle facets (`PHOTO_LIBRARY_SCOPE_TABS`).

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

/** Lifecycle facet tabs — the chrome's primary axis. */
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

/** Apply a lifecycle facet tab. */
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
    value === 'repair' ||
    value === 'customer' ||
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

/** Library view modes. */
export type PhotoLibraryViewMode = 'grid-sm' | 'grid-lg' | 'grid-ticket' | 'list';

/** Canonical left→right view order. */
export const PHOTO_LIBRARY_VIEW_ORDER: readonly PhotoLibraryViewMode[] = [
  'grid-sm',
  'grid-lg',
  'grid-ticket',
  'list',
];

/** Display modes in the second-header toggle, and the keyboard-shortcut target (`1` → List). */
export const PHOTO_LIBRARY_HEADER_DISPLAY_MODES: readonly PhotoLibraryViewMode[] = ['list'];

/** Server page size for the library query (usePhotoLibrary requests this many per page). */
export const PHOTO_LIBRARY_PAGE_SIZE = 48;

/** Folder-leaf contact sheet — newest N photos, then an explicit Load more. */
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

/** Outbound's document sub-filter vocabulary. */
const OUTBOUND_DOCUMENT_TYPE_LABELS: Record<OutboundDocumentTypeFilter | 'pack_photos', string> = {
  all: 'All documents',
  shipping_label: 'Shipping labels',
  packing_slip: 'Packing slips',
  pack_photos: 'Pack photos',
};

const PHOTO_ENTITY_TYPE_LABELS: Record<string, string> = {
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
    // Repair evidence: photos linked to the repair-service ticket itself, plus
    // the existing serial-unit captures (testing/repair bench shots). The
    // library query widens this single param to both entity types.
    case 'repair':
      return 'REPAIR_SERVICE';
    case 'claims':
      return 'ZENDESK_TICKET';
    case 'outbound':
      return undefined;
    default:
      return undefined;
  }
}

function isOutboundLibraryScope(scope: PhotoLibrarySourceScope | undefined): boolean {
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

/** Bare-load view — the flat reverse-chronological stream. */
export const DEFAULT_PHOTO_LIBRARY_VIEW: PhotoLibraryViewMode = 'grid-sm';

export function parsePhotoLibraryViewMode(raw: string | null): PhotoLibraryViewMode {
  if (raw === 'grid-sm' || raw === 'grid-lg' || raw === 'grid-ticket' || raw === 'list') {
    return raw;
  }
  // Absent, unknown, or the retired `folders` → the flat stream.
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

/** Display state = `view` + `page` + the open inspector record (`photoId`). */
interface PhotoLibraryDisplayState {
  view: PhotoLibraryViewMode;
  page: number;
  /** The one photo open in the desk inspector, or `undefined` when closed. */
  photoId?: string;
}

/** `?photoId=` is a DISPLAY param, never a filter — it must never reach `buildLibraryWhere`, or opening a photo would narrow the stream it… */
export function parsePhotoLibraryDisplayParams(
  params: URLSearchParams,
): PhotoLibraryDisplayState {
  const pageRaw = parseInt(params.get('page') ?? '1', 10);
  const photoId = params.get('photoId')?.trim();
  return {
    view: parsePhotoLibraryViewMode(params.get('view')),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    ...(photoId && /^[1-9]\d*$/.test(photoId) ? { photoId } : {}),
  };
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
  display: PhotoLibraryDisplayState,
  base?: URLSearchParams,
): URLSearchParams {
  const params = photoLibraryFiltersToParams(filters, base);
  // Omit the DEFAULT view, not a hardcoded mode — these two must stay in lockstep with `parsePhotoLibraryViewMode` or the round-trip breaks…
  if (display.view !== DEFAULT_PHOTO_LIBRARY_VIEW) params.set('view', display.view);
  else params.delete('view');
  if (display.page > 1) params.set('page', String(display.page));
  else params.delete('page');
  // Absent from the display bag = the inspector is closed. This is what makes
  // `applyView` / `clearAll` drop an open photo without either of them naming
  // it: they construct a fresh display bag rather than copying this one.
  if (display.photoId) params.set('photoId', display.photoId);
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

/** Deep link to the pack photos captured for ONE outbound shipment. */
function packPhotosLibraryHref(tracking: string): string {
  const params = new URLSearchParams({
    sourceScope: 'outbound',
    outboundMedia: 'pack_photos',
    tracking: tracking.trim(),
  });
  return `/ops/photos?${params.toString()}`;
}
