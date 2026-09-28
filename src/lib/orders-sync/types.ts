export interface TransferOrderDetail {
  orderId: string;
  productTitle: string;
  sku: string;
  itemNumber: string;
  tracking: string;
  titleSource: 'sheet' | 'sku_catalog' | 'platform_lookup' | 'title_catalog_match' | 'none';
  /** For `updated` / `deleted` rows: */
  existingAccountSource?: string | null;
  existingCreatedAt?: string | null;
  /** The platform account_source the order was recorded under (an
   *  aggregator import names the real channel, never itself). */
  platform?: string | null;
  /** Quarantined rows: why the import refused to guess. */
  quarantineReason?: string | null;
  // ── Import record ids (`order_import_run_rows`, `src/lib/imports/types.ts`) ──
  /** `orders.id` the writer inserted or backfilled; null for refused / ambiguous rows. */
  orderRowId?: number | null;
  /** What the writer did to the row: a plain backfill of the same source's row, or
   *  a cross-source ADOPT / CLAIM (`order-source-match.ts`). */
  outcome?: 'inserted' | 'backfilled' | 'adopted' | 'claimed' | 'ambiguous' | 'quarantined';
  /** Snake_case `orders` columns whose value this write changed (`item_number`, `sku`, …). */
  filledFields?: string[];
  /** The account_source the incoming order carried. */
  accountSource?: string | null;
  skuCatalogId?: number | null;
  /** Primary `shipping_tracking_numbers.id` on the row after the write. */
  shipmentId?: number | null;
  /** `order_import_exceptions.id` when the row was parked for review. */
  importExceptionId?: number | null;
}

export interface TransferOrderDetails {
  inserted: TransferOrderDetail[];
  updated: TransferOrderDetail[];
  deleted: TransferOrderDetail[];
  unknownTitle: TransferOrderDetail[];
  /** Rows whose tracking value could not be recognized as a carrier tracking number (carrier detection failed — e.g. */
  unresolvedTracking: TransferOrderDetail[];
  /**
   * Rows imported with a present Item Number that did not resolve to
   * sku_catalog / sku_platform_ids. Enqueued on Review · Catalog link.
   */
  unmatchedCatalog: TransferOrderDetail[];
  /**
   * Orders the import would not attribute or match without guessing (unknown
   * store, number already under several platforms). Parked on Review ·
   * Missing item number (`order_import_exceptions`) instead.
   */
  quarantined?: TransferOrderDetail[];
  /** Orders the writer left untouched because their number matched rows it
   *  would have had to guess between (`ambiguousOrderIds`). */
  ambiguous?: TransferOrderDetail[];
}

export interface OrderExceptionResolutionDetail {
  exceptionId: number;
  tracking: string;
  matchedOrderId?: number;
  sourceStation?: string | null;
}

export type SyncTaskStatus = 'idle' | 'running' | 'done' | 'error';

export interface TransferTabState {
  status: SyncTaskStatus;
  summary?: string;
  details?: TransferOrderDetails | null;
  /**
   * Raw counter bag passed straight through from `SyncOutcome.stats` (the
   * connector seam). The named fields below stay as the typed, UI-facing view
   * of the same numbers.
   */
  stats?: Record<string, number>;
  error?: string;
  inserted?: number;
  updated?: number;
  deleted?: number;
  /** How many of the `updated` rows were tracking-number attachments. */
  trackingAttached?: number;
  /** Rows whose tracking value failed carrier detection (not linked). */
  unresolvedTracking?: number;
  processedRows?: number;
  phase?: SyncPhase;
}

export interface ExceptionsTabState {
  status: SyncTaskStatus;
  summary?: string;
  resolved?: OrderExceptionResolutionDetail[];
  stillOpen?: OrderExceptionResolutionDetail[];
  scanned?: number;
  matched?: number;
  error?: string;
  phase?: SyncPhase;
}

/**
 * Phases emitted by the transfer / exception sync jobs. Used to drive the
 * dialog's "Status…" labels while a long-running step is in flight.
 */
export type SyncPhase =
  | 'starting'
  | 'fetching_shipstation'
  | 'fetching_sheet'
  | 'syncing_platforms'
  | 'resolving_tracking'
  | 'matching_orders'
  | 'inserting'
  | 'updating'
  | 'publishing'
  | 'scanning_exceptions'
  | 'done';

/**
 * NDJSON events streamed back from `POST /api/integrations/[provider]/sync`
 * (Accept: application/x-ndjson) and /api/orders-exceptions/sync. Each line of
 * the response body is one JSON event.
 */
export type SyncStreamEvent =
  | { type: 'phase'; phase: SyncPhase; message?: string; count?: number }
  | { type: 'detail'; kind: 'inserted' | 'updated' | 'deleted' | 'unknownTitle' | 'unresolvedTracking' | 'unmatchedCatalog'; row: TransferOrderDetail }
  | { type: 'exception'; kind: 'resolved' | 'open'; row: OrderExceptionResolutionDetail }
  | { type: 'result'; result: Record<string, unknown> }
  | { type: 'error'; error: string };

/** Progress callback handed to the underlying jobs. Returns void; errors are swallowed. */
export type SyncProgress = (event: SyncStreamEvent) => void;
