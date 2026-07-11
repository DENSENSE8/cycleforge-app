/**
 * Zoho adapter for the InventoryProvider capability facade (Wave B1).
 *
 * WRAPS the existing Zoho modules — it never reimplements them. The heavy
 * modules ('@/lib/zoho' barrel, ZohoInventoryClient, fulfillment-sync) are
 * LAZY-imported inside methods so resolving a provider stays cheap and Zoho
 * code stays out of module graphs that only need resolution.
 *
 * Tenant binding: every call is wrapped in `withZohoOrg(this.orgId, …)`,
 * mirroring exactly what the pre-facade call sites did. Call sites that add a
 * credential-scope audit (`withZohoCredential`) keep that wrapper OUTSIDE the
 * facade call — the nested same-org binding is a no-op.
 */
import type { OrgId } from '@/lib/tenancy/constants';
// Static import is deliberate: clientStatus() must stay synchronous (it is read
// on the mark-received response path before any Zoho work has loaded), and the
// breaker is a cheap in-process read with no credential access.
import { getZohoHttpClientStatus } from '@/lib/zoho/httpClient';
import type { ZohoInventoryClient } from '@/lib/zoho/ZohoInventoryClient';
import type {
  InventoryProvider,
  InventoryProviderClientStatus,
  InventoryProviderHealth,
} from './types';

type ZohoBarrel = typeof import('@/lib/zoho');

export class ZohoInventoryProviderAdapter implements InventoryProvider {
  readonly provider = 'zoho';

  constructor(public readonly orgId: OrgId) {}

  /** Lazy-load the Zoho barrel and run `fn` bound to this provider's org. */
  private async bound<T>(fn: (zoho: ZohoBarrel) => Promise<T>): Promise<T> {
    const [zoho, { withZohoOrg }] = await Promise.all([
      import('@/lib/zoho'),
      import('@/lib/zoho/tenant-context'),
    ]);
    return withZohoOrg(this.orgId, () => fn(zoho));
  }

  /** Same as bound(), for the class-based item/warehouse client. */
  private async boundClient<T>(fn: (client: ZohoInventoryClient) => Promise<T>): Promise<T> {
    const [{ zohoClient }, { withZohoOrg }] = await Promise.all([
      import('@/lib/zoho/ZohoInventoryClient'),
      import('@/lib/zoho/tenant-context'),
    ]);
    return withZohoOrg(this.orgId, () => fn(zohoClient));
  }

  /**
   * Paginated reads: `paginateZohoList` captures the ambient org SYNCHRONOUSLY
   * at generator creation (default-parameter read of `currentZohoOrgId()`), so
   * creating the generator inside the binding is sufficient — iteration may
   * then cross async contexts safely (each page request carries the explicit
   * orgId; see the queue-boundary note in zoho/tenant-context.ts).
   */
  private async *paginate<T>(
    make: (client: ZohoInventoryClient) => AsyncGenerator<T[], void, unknown>,
  ): AsyncGenerator<T[], void, unknown> {
    const [{ zohoClient }, { withZohoOrg }] = await Promise.all([
      import('@/lib/zoho/ZohoInventoryClient'),
      import('@/lib/zoho/tenant-context'),
    ]);
    const gen = await withZohoOrg(this.orgId, async () => make(zohoClient));
    yield* gen;
  }

  async displayLabel(): Promise<string> {
    const { connectedProviderLabel } = await import(
      '@/lib/integrations/capability-connections'
    );
    return connectedProviderLabel(this.orgId, 'inventory');
  }

  async health(): Promise<InventoryProviderHealth> {
    const { zohoValidate } = await import('@/lib/integrations/connectors/zoho');
    const res = await zohoValidate(this.orgId);
    return { ok: res.ok, ...(res.error ? { error: res.error } : {}) };
  }

  clientStatus(): InventoryProviderClientStatus {
    return { circuit: getZohoHttpClientStatus().circuit };
  }

  // ── Purchase orders / receives ────────────────────────────────────────────
  getPurchaseOrder: InventoryProvider['getPurchaseOrder'] = (purchaseOrderId) =>
    this.bound((z) => z.getPurchaseOrderById(purchaseOrderId));

  listPurchaseOrders: InventoryProvider['listPurchaseOrders'] = (params) =>
    this.bound((z) => z.listPurchaseOrders(params));

  updatePurchaseOrder: InventoryProvider['updatePurchaseOrder'] = (purchaseOrderId, body) =>
    this.bound((z) => z.updatePurchaseOrder(purchaseOrderId, body));

  markPurchaseOrderReceived: InventoryProvider['markPurchaseOrderReceived'] = (params) =>
    this.bound((z) => z.createPurchaseReceive(params));

  markPurchaseOrderUnreceived: InventoryProvider['markPurchaseOrderUnreceived'] = (poId) =>
    this.bound((z) => z.markPurchaseOrderAsUnreceived(poId));

  getPurchaseReceive: InventoryProvider['getPurchaseReceive'] = (purchaseReceiveId) =>
    this.bound((z) => z.getPurchaseReceiveById(purchaseReceiveId));

  sumWarehouseReceivedByPoLineItem: InventoryProvider['sumWarehouseReceivedByPoLineItem'] = (
    purchaseOrderId,
  ) => this.bound((z) => z.sumWarehouseReceivedByPoLineItem(purchaseOrderId));

  // ── Item master ───────────────────────────────────────────────────────────
  getItem: InventoryProvider['getItem'] = (itemId) =>
    this.boundClient((c) => c.getItem(itemId));

  listItems: InventoryProvider['listItems'] = (params) =>
    this.boundClient((c) => c.listItems(params));

  findItemBySku: InventoryProvider['findItemBySku'] = (sku) =>
    this.bound((z) => z.searchItemBySku(sku));

  updateItem: InventoryProvider['updateItem'] = (itemId, payload) =>
    this.boundClient((c) => c.updateItem(itemId, payload));

  paginateItems: InventoryProvider['paginateItems'] = (params) =>
    this.paginate((c) => c.paginateItems(params));

  paginateWarehouses: InventoryProvider['paginateWarehouses'] = (params) =>
    this.paginate((c) => c.paginateWarehouses(params));

  // ── Fulfillment push ──────────────────────────────────────────────────────
  syncShippedOrders: InventoryProvider['syncShippedOrders'] = async (opts = {}) => {
    const { syncShippedOrdersToZoho } = await import('@/lib/zoho/fulfillment-sync');
    // The batch runner binds withZohoCredential(orgId, 'salesorders.write', …)
    // internally — orgId is forced to the provider's bound tenant here.
    return syncShippedOrdersToZoho({ ...opts, orgId: this.orgId });
  };
}
