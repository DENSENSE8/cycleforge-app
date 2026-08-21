/**
 * InventoryProvider — the capability facade for the org's inventory backend
 * ("Integrations as SoT" Wave B1).
 *
 * Product/domain code asks for the org's inventory provider
 * (`getInventoryProvider(orgId)` in ./index.ts) instead of importing the Zoho
 * client directly. The interface is deliberately NARROW: it names exactly the
 * operations the current call sites use (mark-received-po, zoho-receiving-sync,
 * InventorySyncService, ensureSkuCatalogEntry, the shipped-fulfillment push).
 *
 * Payload shapes are NOT redesigned in this wave — methods mirror the existing
 * Zoho function signatures 1:1 (via type-only `typeof` references, erased at
 * runtime) so the Zoho adapter is a thin delegation. When a second inventory
 * connector lands, these signatures become the neutral contract to normalize.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  createPurchaseReceive,
  getPurchaseOrderById,
  getPurchaseReceiveById,
  listPurchaseOrders,
  markPurchaseOrderAsUnreceived,
  markPurchaseOrderAsReceived,
  searchItemBySku,
  sumWarehouseReceivedByPoLineItem,
  updatePurchaseOrder,
} from '@/lib/zoho';
import type { ZohoInventoryClient } from '@/lib/zoho/ZohoInventoryClient';
import type { SyncRunOptions, SyncRunReport } from '@/lib/zoho/fulfillment-sync';

/** In-process client circuit state (rate-limit breaker) — cheap, no network. */
export interface InventoryProviderClientStatus {
  circuit: {
    isOpen: boolean;
    retryAfterMs: number;
    consecutiveFailures: number;
  };
}

export interface InventoryProviderHealth {
  ok: boolean;
  error?: string;
}

export interface InventoryProvider {
  /** Provider key backing this org's inventory capability (e.g. 'zoho'). */
  readonly provider: string;
  /** Tenant every call is bound to — set at resolution, never per-call. */
  readonly orgId: OrgId;

  /** Operator-facing label for copy ("Zoho Inventory"). */
  displayLabel(): Promise<string>;
  /** Live credential/connection check (token mint round-trip). */
  health(): Promise<InventoryProviderHealth>;
  /** Synchronous in-process client status (circuit breaker) — no network. */
  clientStatus(): InventoryProviderClientStatus;

  // ── Purchase orders / receives ────────────────────────────────────────────
  getPurchaseOrder: typeof getPurchaseOrderById;
  listPurchaseOrders: typeof listPurchaseOrders;
  updatePurchaseOrder: typeof updatePurchaseOrder;
  /** Create a purchase receive (the "mark received" push). */
  markPurchaseOrderReceived: typeof createPurchaseReceive;
  /**
   * Mark the WHOLE PO received without posting line quantities — the API twin
   * of Zoho's own "Mark as Received" button. Needed when a billed PO reports
   * nothing pending yet is still un-received, where a line-item purchase
   * receive is impossible but the PO must still leave transit.
   */
  markPurchaseOrderReceivedWhole: typeof markPurchaseOrderAsReceived;
  /** Reverse a prior receive so the PO returns to issued. */
  markPurchaseOrderUnreceived: typeof markPurchaseOrderAsUnreceived;
  getPurchaseReceive: typeof getPurchaseReceiveById;
  /** Warehouse-received totals per PO line_item_id (drives pending math). */
  sumWarehouseReceivedByPoLineItem: typeof sumWarehouseReceivedByPoLineItem;

  // ── Item master ───────────────────────────────────────────────────────────
  getItem: ZohoInventoryClient['getItem'];
  listItems: ZohoInventoryClient['listItems'];
  /** Fuzzy single-item lookup by SKU (leading-zero tolerant). */
  findItemBySku: typeof searchItemBySku;
  updateItem: ZohoInventoryClient['updateItem'];
  paginateItems: ZohoInventoryClient['paginateItems'];
  paginateWarehouses: ZohoInventoryClient['paginateWarehouses'];

  // ── Fulfillment push (shipped orders → provider accounting chain) ─────────
  syncShippedOrders(opts?: Omit<SyncRunOptions, 'orgId'>): Promise<SyncRunReport>;
}
