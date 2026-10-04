/** InventoryProvider — the capability facade for the org's inventory backend ("Integrations as SoT" Wave B1). */
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
  /** Mark the WHOLE PO received without posting line quantities — the API twin of Zoho's own "Mark as Received" button. */
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
}
