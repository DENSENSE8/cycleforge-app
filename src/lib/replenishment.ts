import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { getCurrentPSTDateKey } from '@/utils/date';
import { getPurchaseOrderById, listPurchaseReceives } from '@/lib/zoho';
import { zohoPost } from '@/lib/zoho/httpClient';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import { withTenantConnection, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { attachShortageReplenishment } from '@/lib/orders/order-line-shortage';
import { earmarkPoForReplenishmentRequest } from '@/lib/orders/shortage-inbound';
import { readInventoryPositions, type InventoryPosition } from '@/lib/inventory/inventory-position';
import { ingestInboundOrderInTx } from '@/lib/inbound/ingest-inbound-order';
import { emptyInboundOrderDraft, emptyInboundOrderLine } from '@/lib/inbound/inbound-order-draft';
import type { TxClient } from '@/lib/inbound/purchase-links';
import {
  REPLENISHMENT_ALLOWED_TRANSITIONS,
  type ReplenishmentRequestStatus,
} from '@/lib/replenishment-request-status';

export interface ReplenishmentRequestRow {
  id: string;
  item_id: string | null;
  /** External (Zoho) item id — a fact for export, not the identity. */
  zoho_item_id: string | null;
  /** The internal catalog item — the request's identity. */
  sku_catalog_id: number | null;
  supplier_id: number | null;
  inbound_order_id: number | null;
  sku: string | null;
  item_name: string;
  quantity_needed: string;
  zoho_quantity_available: string | null;
  zoho_quantity_on_hand: string | null;
  zoho_incoming_quantity: string | null;
  /** CycleForge's own inventory position (src/lib/inventory/inventory-position.ts). */
  stock_available: string | null;
  stock_on_hand: string | null;
  stock_incoming: string | null;
  quantity_to_order: string | null;
  vendor_zoho_contact_id: string | null;
  vendor_name: string | null;
  unit_cost: string | null;
  status: ReplenishmentRequestStatus;
  status_changed_at: string;
  zoho_po_id: string | null;
  zoho_po_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Minimal query surface — a raw pool, a pool client, or a test fake. */
export type DbClient = Pick<PoolClient, 'query'> | typeof pool;

const ACTIVE_STATUSES: ReplenishmentRequestStatus[] = [
  'detected',
  'pending_review',
  'planned_for_po',
  'po_created',
  'waiting_for_receipt',
];

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeQuantity(value: unknown): number {
  const parsed = toNumber(value, 1);
  return parsed > 0 ? parsed : 1;
}

function itemVendorMetadata(customFields: unknown) {
  const meta = (customFields && typeof customFields === 'object') ? (customFields as Record<string, unknown>) : {};

  const vendorZohoContactId = cleanText(
    meta.default_vendor_zoho_id ??
    meta.vendor_zoho_contact_id ??
    meta.vendor_id ??
    meta.vendor_contact_id
  );

  const vendorName = cleanText(
    meta.default_vendor_name ??
    meta.vendor_name ??
    meta.vendor
  );

  return { vendorZohoContactId, vendorName };
}

async function getOrderItemContext(orderId: number, client: DbClient, orgId: OrgId) {
  const result = await client.query(
    `SELECT
       o.id,
       o.order_id,
       o.product_title,
       o.sku,
       o.quantity,
       o.is_out_of_stock,
       o.oos_sku,
       o.oos_qty_short,
       i.id AS item_id,
       i.zoho_item_id,
       i.name AS item_name,
       i.purchase_rate,
       i.quantity_available AS item_quantity_available,
       i.quantity_on_hand AS item_quantity_on_hand,
       i.custom_fields,
       COALESCE(
         o.oos_sku_catalog_id,
         o.sku_catalog_id,
         (SELECT x.sku_catalog_id FROM catalog_external_ids x
           WHERE x.organization_id = o.organization_id AND x.provider = 'zoho'
             AND x.external_id = NULLIF(BTRIM(o.oos_zoho_item_id), '') LIMIT 1),
         (SELECT sc2.id FROM sku_catalog sc2
           WHERE sc2.organization_id = o.organization_id
             AND sc2.sku = COALESCE(NULLIF(BTRIM(o.oos_sku), ''), NULLIF(BTRIM(o.sku), '')) LIMIT 1)
       ) AS sku_catalog_id
     FROM orders o
     LEFT JOIN LATERAL (
       SELECT i2.id, i2.zoho_item_id, i2.name, i2.purchase_rate,
              i2.quantity_available, i2.quantity_on_hand, i2.custom_fields
         FROM items i2
         LEFT JOIN sku_catalog sc
           ON sc.organization_id = o.organization_id
          AND (
            sc.id = o.oos_sku_catalog_id
            OR sc.id = o.sku_catalog_id
          )
        WHERE i2.organization_id = o.organization_id
          AND (
            (sc.provider_item_id IS NOT NULL AND i2.zoho_item_id = sc.provider_item_id)
            OR (NULLIF(BTRIM(o.oos_zoho_item_id), '') IS NOT NULL AND i2.zoho_item_id = BTRIM(o.oos_zoho_item_id))
            OR (NULLIF(BTRIM(o.oos_sku), '') IS NOT NULL AND i2.sku = BTRIM(o.oos_sku))
            OR (NULLIF(BTRIM(o.sku), '') IS NOT NULL AND i2.sku = BTRIM(o.sku))
          )
        ORDER BY
          CASE
            WHEN sc.provider_item_id IS NOT NULL AND i2.zoho_item_id = sc.provider_item_id AND sc.id = o.oos_sku_catalog_id THEN 0
            WHEN NULLIF(BTRIM(o.oos_zoho_item_id), '') IS NOT NULL AND i2.zoho_item_id = BTRIM(o.oos_zoho_item_id) THEN 1
            WHEN sc.provider_item_id IS NOT NULL AND i2.zoho_item_id = sc.provider_item_id THEN 2
            WHEN i2.sku = BTRIM(o.oos_sku) THEN 3
            ELSE 4
          END
        LIMIT 1
     ) i ON TRUE
     WHERE o.id = $1
       AND o.organization_id = $2
     LIMIT 1`,
    [orderId, orgId]
  );

  return result.rows[0] ?? null;
}

/**
 * The request's internal catalog item: its own `sku_catalog_id`, else the
 * crosswalk of its Zoho item id (requests created before 2026-09-27i).
 */
async function catalogIdForRequest(request: ReplenishmentRequestRow, exec: DbClient, orgId: OrgId): Promise<number | null> {
  if (request.sku_catalog_id != null) return Number(request.sku_catalog_id);
  if (!request.zoho_item_id) return null;
  const hit = await exec.query(
    `SELECT sku_catalog_id FROM catalog_external_ids
      WHERE organization_id = $1 AND provider = 'zoho' AND external_id = $2 LIMIT 1`,
    [orgId, request.zoho_item_id],
  );
  return hit.rows[0]?.sku_catalog_id != null ? Number(hit.rows[0].sku_catalog_id) : null;
}

/** CycleForge's own position for one catalog item (zeros when the item is unknown). */
async function positionFor(skuCatalogId: number | null, exec: DbClient, orgId: OrgId): Promise<InventoryPosition | null> {
  if (skuCatalogId == null) return null;
  const positions = await readInventoryPositions(
    (text, params) => exec.query(text, params as unknown[]) as never,
    orgId,
    [skuCatalogId],
  );
  return positions.get(skuCatalogId) ?? null;
}

async function findActiveRequestForItemBody(
  item: { skuCatalogId: number | null; zohoItemId: string | null },
  exec: DbClient,
  orgId: OrgId,
): Promise<ReplenishmentRequestRow | null> {
  const result = await exec.query(
    `SELECT *
     FROM replenishment_requests
     WHERE organization_id = $3
       AND status = ANY($2::replenishment_status[])
       AND (($1::int IS NOT NULL AND sku_catalog_id = $1)
            OR ($4::text IS NOT NULL AND zoho_item_id = $4))
     ORDER BY (sku_catalog_id IS NOT DISTINCT FROM $1::int) DESC, created_at DESC
     LIMIT 1`,
    [item.skuCatalogId, ACTIVE_STATUSES, orgId, item.zohoItemId]
  );
  return (result.rows[0] as ReplenishmentRequestRow | undefined) ?? null;
}

async function findActiveRequestForItem(
  item: { skuCatalogId: number | null; zohoItemId: string | null },
  client: DbClient,
  orgId: OrgId,
): Promise<ReplenishmentRequestRow | null> {
  if (client !== pool) return findActiveRequestForItemBody(item, client, orgId);
  return withTenantConnection(orgId, (c) => findActiveRequestForItemBody(item, c, orgId));
}

async function recomputeRequestQuantityBody(requestId: string, exec: DbClient, orgId: OrgId) {
  await exec.query(
    `UPDATE replenishment_requests rr
     SET quantity_needed = COALESCE((
           SELECT SUM(rol.quantity_needed)
           FROM replenishment_order_lines rol
           WHERE rol.replenishment_request_id = rr.id
             AND rol.organization_id = rr.organization_id
         ), 0),
         updated_at = NOW()
     WHERE rr.id = $1
       AND rr.organization_id = $2`,
    [requestId, orgId]
  );
}

async function recomputeRequestQuantity(requestId: string, client: DbClient, orgId: OrgId) {
  if (client !== pool) return recomputeRequestQuantityBody(requestId, client, orgId);
  return withTenantTransaction(orgId, (c) => recomputeRequestQuantityBody(requestId, c, orgId));
}

async function transitionReplenishmentStatusBody(
  requestId: string,
  nextStatus: ReplenishmentRequestStatus,
  changedBy: string,
  note: string | null | undefined,
  exec: DbClient,
  orgId: OrgId
) {
  const result = await exec.query(
    `SELECT id, status FROM replenishment_requests WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [requestId, orgId]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Replenishment request not found');

  const current = row.status as ReplenishmentRequestStatus;
  if (current === nextStatus) return;
  if (!REPLENISHMENT_ALLOWED_TRANSITIONS[current].includes(nextStatus)) {
    throw new Error(`Invalid replenishment transition: ${current} -> ${nextStatus}`);
  }

  await exec.query(
    `UPDATE replenishment_requests
     SET status = $2, status_changed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $3`,
    [requestId, nextStatus, orgId]
  );

  // Child insert: derive org from the parent request (also a backstop if the
  // threaded orgId ever diverges from the row's true owner).
  await exec.query(
    `INSERT INTO replenishment_status_log (organization_id, replenishment_request_id, from_status, to_status, changed_by, note)
     SELECT rr.organization_id, $1, $2, $3, $4, $5
     FROM replenishment_requests rr
     WHERE rr.id = $1 AND rr.organization_id = $6`,
    [requestId, current, nextStatus, changedBy, cleanText(note), orgId]
  );
}

export async function transitionReplenishmentStatus(
  requestId: string,
  nextStatus: ReplenishmentRequestStatus,
  changedBy: string,
  note: string | null | undefined,
  client: DbClient,
  orgId: OrgId
) {
  if (client !== pool) return transitionReplenishmentStatusBody(requestId, nextStatus, changedBy, note, client, orgId);
  return withTenantTransaction(orgId, (c) => transitionReplenishmentStatusBody(requestId, nextStatus, changedBy, note, c, orgId));
}

async function recalculateNeedBody(requestId: string, exec: DbClient, orgId: OrgId) {
  const result = await exec.query(
    `SELECT * FROM replenishment_requests WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [requestId, orgId]
  );
  const request = result.rows[0] as ReplenishmentRequestRow | undefined;
  if (!request) return;

  const skuCatalogId = await catalogIdForRequest(request, exec, orgId);
  const stock = await positionFor(skuCatalogId, exec, orgId);
  const effectiveShortfall = Math.max(
    0,
    toNumber(request.quantity_needed, 0) - (stock?.available ?? 0) - (stock?.incoming ?? 0)
  );

  await exec.query(
    `UPDATE replenishment_requests
     SET stock_available = $2,
         stock_on_hand = $3,
         stock_incoming = $4,
         sku_catalog_id = COALESCE(sku_catalog_id, $6),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $5`,
    [requestId, stock?.available ?? 0, stock?.onHand ?? 0, stock?.incoming ?? 0, orgId, skuCatalogId]
  );

  if (effectiveShortfall === 0 && ['detected', 'pending_review'].includes(request.status)) {
    await transitionReplenishmentStatus(requestId, 'cancelled', 'system', 'Incoming stock already covers demand', exec, orgId);
  }
}

export async function recalculateNeed(requestId: string, client: DbClient, orgId: OrgId) {
  if (client !== pool) return recalculateNeedBody(requestId, client, orgId);
  return withTenantTransaction(orgId, (c) => recalculateNeedBody(requestId, c, orgId));
}

async function ensureReplenishmentForOrderBody(
  client: PoolClient,
  options: { orderId: number; reason?: string | null; changedBy?: string; forceFullQuantity?: boolean },
  orgId: OrgId
): Promise<{ requestId: string | null; skipped: 'order_not_found' | 'item_not_linked' | null }> {
  const { orderId, reason, changedBy = 'system', forceFullQuantity = false } = options;

  const order = await getOrderItemContext(orderId, client, orgId);
  if (!order) {
    return { requestId: null, skipped: 'order_not_found' as const };
  }

  // The internal catalog item is the identity; a Zoho item is optional.
  const skuCatalogId = order.sku_catalog_id != null ? Number(order.sku_catalog_id) : null;
  const zohoItemId = cleanText(order.zoho_item_id);
  if (skuCatalogId == null && !zohoItemId) {
    return { requestId: null, skipped: 'item_not_linked' as const };
  }

  const stock = await positionFor(skuCatalogId, client, orgId);
  const orderQty = normalizeQuantity(order.oos_qty_short ?? order.quantity);
  const shortfall = forceFullQuantity ? orderQty : Math.max(0, orderQty - (stock?.available ?? 0));
  const quantityNeeded = shortfall > 0 ? shortfall : orderQty;

  const existing = await findActiveRequestForItem({ skuCatalogId, zohoItemId }, client, orgId);
  let requestId = existing?.id ?? null;

  if (!existing) {
    const vendor = itemVendorMetadata(order.custom_fields);
    const insert = await client.query(
      `INSERT INTO replenishment_requests (
         organization_id,
         item_id,
         zoho_item_id,
         sku,
         item_name,
         quantity_needed,
         stock_available,
         stock_on_hand,
         stock_incoming,
         vendor_zoho_contact_id,
         vendor_name,
         unit_cost,
         status,
         notes,
         sku_catalog_id
       ) VALUES ($13, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'detected', $12, $14)
       RETURNING id`,
      [
        order.item_id ?? null,
        zohoItemId,
        cleanText(order.sku),
        cleanText(order.item_name) || cleanText(order.product_title) || 'Unknown item',
        quantityNeeded,
        stock?.available ?? 0,
        stock?.onHand ?? 0,
        stock?.incoming ?? 0,
        vendor.vendorZohoContactId,
        vendor.vendorName,
        cleanText(order.purchase_rate),
        cleanText(reason) || (order.is_out_of_stock ? 'Out of stock' : null),
        orgId,
        skuCatalogId,
      ]
    );
    requestId = String(insert.rows[0].id);

    // Child insert: derive org from the just-created parent request.
    await client.query(
      `INSERT INTO replenishment_status_log (organization_id, replenishment_request_id, from_status, to_status, changed_by, note)
       SELECT rr.organization_id, $1, NULL, 'detected', $2, $3
       FROM replenishment_requests rr
       WHERE rr.id = $1 AND rr.organization_id = $4`,
      [requestId, changedBy, cleanText(reason) || (order.is_out_of_stock ? 'Out of stock' : null), orgId]
    );
  }

  // Child insert: derive org from the parent request to keep the line owned
  // by the same tenant.
  await client.query(
    `INSERT INTO replenishment_order_lines (
       organization_id,
       replenishment_request_id,
       order_id,
       channel_order_id,
       quantity_needed
     )
     SELECT rr.organization_id, $1, $2, $3, $4
     FROM replenishment_requests rr
     WHERE rr.id = $1 AND rr.organization_id = $5
     ON CONFLICT (replenishment_request_id, order_id) DO UPDATE SET
       channel_order_id = EXCLUDED.channel_order_id,
       quantity_needed = EXCLUDED.quantity_needed`,
    [requestId, orderId, cleanText(order.order_id), quantityNeeded, orgId]
  );

  await recomputeRequestQuantity(String(requestId), client, orgId);

  await attachShortageReplenishment(client, {
    orgId,
    orderId,
    replenishmentRequestId: String(requestId),
  });

  if (cleanText(reason)) {
    await client.query(
      `UPDATE replenishment_requests
       SET notes = CASE
           WHEN notes IS NULL OR BTRIM(notes) = '' THEN $2
           WHEN POSITION($2 IN notes) > 0 THEN notes
           ELSE notes || E'\n' || $2
         END,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $3`,
      [requestId, cleanText(reason), orgId]
    );
  }

  await recalculateNeed(String(requestId), client, orgId);

  return { requestId: String(requestId), skipped: null };
}

export async function ensureReplenishmentForOrder(options: {
  orderId: number;
  reason?: string | null;
  changedBy?: string;
  forceFullQuantity?: boolean;
}, orgId: OrgId) {
  // Run the whole unit of work inside one GUC-scoped transaction.
  return withTenantTransaction(orgId, (client) =>
    ensureReplenishmentForOrderBody(client, options, orgId)
  );
}

async function clearReplenishmentForOrderBody(client: PoolClient, orderId: number, changedBy: string, orgId: OrgId) {
  const orderLinks = await client.query(
    `SELECT replenishment_request_id
     FROM replenishment_order_lines
     WHERE order_id = $1 AND organization_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId, orgId]
  );
  const requestId = orderLinks.rows[0]?.replenishment_request_id as string | null | undefined;

  await client.query(`DELETE FROM replenishment_order_lines WHERE order_id = $1 AND organization_id = $2`, [orderId, orgId]);

  if (requestId) {
    await recomputeRequestQuantity(requestId, client, orgId);
    const req = await client.query(
      `SELECT quantity_needed, status FROM replenishment_requests WHERE id = $1 AND organization_id = $2`,
      [requestId, orgId]
    );
    const quantityNeeded = toNumber(req.rows[0]?.quantity_needed, 0);
    const status = req.rows[0]?.status as ReplenishmentRequestStatus | undefined;

    if (quantityNeeded <= 0 && status && ['detected', 'pending_review', 'planned_for_po'].includes(status)) {
      await transitionReplenishmentStatus(requestId, 'cancelled', changedBy, 'Order no longer requires replenishment', client, orgId);
    }
  }
}

export async function clearReplenishmentForOrder(orderId: number, changedBy = 'staff', orgId: OrgId) {
  return withTenantTransaction(orgId, (client) =>
    clearReplenishmentForOrderBody(client, orderId, changedBy, orgId)
  );
}

export async function listNeedToOrder(options: {
  statuses?: ReplenishmentRequestStatus[];
  page?: number;
  limit?: number;
  skuSearch?: string | null;
  sort?: 'fifo' | 'newest';
}, orgId: OrgId) {
  const statuses = options.statuses?.length ? options.statuses : ACTIVE_STATUSES;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const page = Math.max(1, options.page ?? 1);
  const offset = (page - 1) * limit;
  const skuSearch = cleanText(options.skuSearch) ?? null;
  const sortDir = options.sort === 'newest' ? 'DESC' : 'ASC'; // FIFO by default

  // Reads gated by rr.organization_id; the internal order joins on its id + org.
  // Params (rows): $1 statuses, $2 limit, $3 offset, $4 orgId, [$5 skuSearch].
  const rowsParams: unknown[] = [statuses, limit, offset, orgId];
  if (skuSearch) rowsParams.push(skuSearch);
  const skuClause = skuSearch ? `AND (rr.sku ILIKE '%' || $5 || '%' OR rr.item_name ILIKE '%' || $5 || '%')` : '';

  const [rows, count] = await Promise.all([
    withTenantConnection(orgId, (c) => c.query(
      `SELECT
         rr.*,
         io.order_number AS inbound_order_number,
         io.status AS inbound_order_status,
         COALESCE((
           SELECT json_agg(
             json_build_object(
               'order_id', rol.order_id,
               'channel_order_id', rol.channel_order_id,
               'quantity', rol.quantity_needed
             )
             ORDER BY rol.created_at ASC
           )
           FROM replenishment_order_lines rol
           WHERE rol.replenishment_request_id = rr.id
             AND rol.organization_id = rr.organization_id
         ), '[]'::json) AS orders_waiting
       FROM replenishment_requests rr
       LEFT JOIN inbound_order io
         ON io.id = rr.inbound_order_id
         AND io.organization_id = rr.organization_id
       WHERE rr.status = ANY($1::replenishment_status[])
         AND rr.organization_id = $4
       ${skuClause}
       ORDER BY rr.created_at ${sortDir}
       LIMIT $2 OFFSET $3`,
      rowsParams
    )),
    withTenantConnection(orgId, (c) => c.query(
      `SELECT COUNT(*)::int AS count
       FROM replenishment_requests
       WHERE status = ANY($1::replenishment_status[])
         AND organization_id = $2
       ${skuSearch ? `AND (sku ILIKE '%' || $3 || '%' OR item_name ILIKE '%' || $3 || '%')` : ''}`,
      skuSearch ? [statuses, orgId, skuSearch] : [statuses, orgId]
    )),
  ]);

  return {
    items: rows.rows,
    total: count.rows[0]?.count ?? 0,
    page,
    limit,
  };
}

async function updateNeedToOrderRequestBody(
  client: PoolClient,
  id: string,
  body: {
    quantity_needed?: number;
    quantity_to_order?: number;
    status?: ReplenishmentRequestStatus;
    notes?: string | null;
    vendor_zoho_contact_id?: string | null;
    vendor_name?: string | null;
    unit_cost?: number | null;
  },
  changedBy: string,
  orgId: OrgId
) {
  const existing = await client.query(
    `SELECT * FROM replenishment_requests WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [id, orgId]
  );
  const row = existing.rows[0] as ReplenishmentRequestRow | undefined;
  if (!row) throw new Error('Not found');

  if (body.status && body.status !== row.status) {
    await transitionReplenishmentStatus(id, body.status, changedBy, body.notes || null, client, orgId);
  }

  await client.query(
    `UPDATE replenishment_requests
     SET quantity_needed = COALESCE($2, quantity_needed),
         quantity_to_order = COALESCE($3, quantity_to_order),
         notes = COALESCE($4, notes),
         vendor_zoho_contact_id = COALESCE($5, vendor_zoho_contact_id),
         vendor_name = COALESCE($6, vendor_name),
         unit_cost = COALESCE($7, unit_cost),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $8`,
    [
      id,
      body.quantity_needed ?? null,
      body.quantity_to_order ?? null,
      body.notes === undefined ? null : cleanText(body.notes),
      body.vendor_zoho_contact_id === undefined ? null : cleanText(body.vendor_zoho_contact_id),
      body.vendor_name === undefined ? null : cleanText(body.vendor_name),
      body.unit_cost ?? null,
      orgId,
    ]
  );
}

export async function updateNeedToOrderRequest(
  id: string,
  body: {
    quantity_needed?: number;
    quantity_to_order?: number;
    status?: ReplenishmentRequestStatus;
    notes?: string | null;
    vendor_zoho_contact_id?: string | null;
    vendor_name?: string | null;
    unit_cost?: number | null;
  },
  changedBy = 'staff',
  orgId: OrgId
) {
  return withTenantTransaction(orgId, (client) =>
    updateNeedToOrderRequestBody(client, id, body, changedBy, orgId)
  );
}

export async function cancelNeedToOrderRequest(id: string, changedBy = 'staff', orgId: OrgId) {
  // `pool` is the sentinel client: transitionReplenishmentStatus self-wraps in a
  // GUC-scoped transaction for it.
  await transitionReplenishmentStatus(id, 'cancelled', changedBy, 'Manually cancelled', pool, orgId);
}

/**
 * Injectable collaborators for createDraftPurchaseOrders so unit tests run
 * DB-free / Zoho-free (house `Deps` pattern, see backend-patterns.md).
 */
export interface CreateDraftPurchaseOrdersDeps {
  loadRequests: (replenishmentIds: string[], orgId: OrgId) => Promise<ReplenishmentRequestRow[]>;
  /** Optional export — only called when the caller asks for a Zoho copy. */
  createZohoPurchaseOrder: (
    orgId: OrgId,
    payload: {
      vendor_id: string;
      date: string;
      line_items: Array<{ item_id: string; quantity: number; rate: number }>;
      notes: string;
    }
  ) => Promise<{ purchaseorder?: { purchaseorder_id?: string; purchaseorder_number?: string } }>;
  withTenantTransaction: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  transitionStatus: typeof transitionReplenishmentStatus;
  ingestOrder: typeof ingestInboundOrderInTx;
}

const defaultCreateDraftPurchaseOrdersDeps: CreateDraftPurchaseOrdersDeps = {
  loadRequests: async (replenishmentIds, orgId) => {
    const result = await withTenantConnection(orgId, (c) => c.query(
      `SELECT *
       FROM replenishment_requests
       WHERE id = ANY($1::uuid[])
         AND organization_id = $2`,
      [replenishmentIds, orgId]
    ));
    return result.rows as ReplenishmentRequestRow[];
  },
  createZohoPurchaseOrder: (orgId, payload) =>
    withZohoOrg(orgId, () => zohoPost<{ purchaseorder?: { purchaseorder_id?: string; purchaseorder_number?: string } }>(
      '/api/v1/purchaseorders',
      payload
    )),
  withTenantTransaction,
  transitionStatus: transitionReplenishmentStatus,
  ingestOrder: ingestInboundOrderInTx,
};

export interface CreatedPurchaseOrder {
  vendor: string | null;
  inbound_order_id: number;
  order_number: string;
  /** Present only when a Zoho copy was exported. */
  zoho_po_id: string | null;
  zoho_po_number: string | null;
}

/**
 * Turn staged replenishment requests into purchase orders — one INTERNAL
 * inbound order per vendor (CycleForge's own `inbound_order`, origin
 * `auto_replenish`, landed through the one inbound writer). The order is on
 * Incoming, its lines are what receiving expects, and every shortage that
 * asked for it is earmarked onto it. Zoho is not involved unless
 * `exportToZoho` asks for a copy (requests that carry a Zoho item + vendor).
 */
export async function createDraftPurchaseOrders(
  replenishmentIds: string[],
  orgId: OrgId,
  deps: CreateDraftPurchaseOrdersDeps = defaultCreateDraftPurchaseOrdersDeps,
  opts: { exportToZoho?: boolean; staffId?: number | null } = {},
): Promise<CreatedPurchaseOrder[]> {
  const requests = await deps.loadRequests(replenishmentIds, orgId);

  const byVendor = new Map<string, ReplenishmentRequestRow[]>();
  for (const request of requests) {
    if (request.sku_catalog_id == null && !cleanText(request.sku)) continue;
    if (Math.max(0, toNumber(request.quantity_to_order, 0)) <= 0) continue;
    const vendorKey = request.supplier_id != null
      ? `s:${request.supplier_id}`
      : `n:${(cleanText(request.vendor_name) ?? cleanText(request.vendor_zoho_contact_id) ?? '').toLowerCase()}`;
    const bucket = byVendor.get(vendorKey) ?? [];
    bucket.push(request);
    byVendor.set(vendorKey, bucket);
  }

  const created: CreatedPurchaseOrder[] = [];
  const day = getCurrentPSTDateKey().replace(/-/g, '');

  for (const vendorRequests of byVendor.values()) {
    const vendor = cleanText(vendorRequests[0].vendor_name);
    const orderNumber = `RP-${day}-${vendorRequests[0].id.slice(0, 8).toUpperCase()}`;
    const draft = {
      ...emptyInboundOrderDraft('PO'),
      platform: 'manual',
      orderNumber,
      vendor: vendor ?? '',
      notes: `Replenishment: ${vendorRequests.map((r) => r.sku || r.item_name).join(', ')}`,
      tracking: [],
      lines: vendorRequests.map((r) => ({
        ...emptyInboundOrderLine(),
        lineKey: `R-${r.id.slice(0, 8)}`,
        skuCatalogId: r.sku_catalog_id,
        sku: r.sku ?? '',
        title: r.item_name,
        quantity: Math.max(1, Math.round(toNumber(r.quantity_to_order, 0))),
        unitCostCents: r.unit_cost != null ? Math.round(toNumber(r.unit_cost, 0) * 100) : null,
      })),
    };

    let zohoPoId: string | null = null;
    let zohoPoNumber: string | null = null;
    const zohoVendor = cleanText(vendorRequests[0].vendor_zoho_contact_id);
    if (opts.exportToZoho && zohoVendor && vendorRequests.every((r) => cleanText(r.zoho_item_id))) {
      const response = await deps.createZohoPurchaseOrder(orgId, {
        vendor_id: zohoVendor,
        date: getCurrentPSTDateKey(),
        line_items: vendorRequests.map((r) => ({
          item_id: r.zoho_item_id as string,
          quantity: Math.max(1, Math.round(toNumber(r.quantity_to_order, 0))),
          rate: toNumber(r.unit_cost, 0),
        })),
        notes: `Exported from CycleForge inbound order ${orderNumber}`,
      });
      zohoPoId = cleanText(response.purchaseorder?.purchaseorder_id);
      zohoPoNumber = cleanText(response.purchaseorder?.purchaseorder_number);
      if (!zohoPoId || !zohoPoNumber) throw new Error('Zoho PO create returned no purchaseorder id/number');
    }

    const inboundOrderId = await deps.withTenantTransaction(orgId, async (client) => {
      const landed = await deps.ingestOrder(client as unknown as TxClient, orgId, draft, {
        origin: 'auto_replenish',
        source: 'replenish',
        staffId: opts.staffId ?? null,
        sourceEventId: `replenish:${orderNumber}`,
        replenishmentRequestId: vendorRequests.length === 1 ? vendorRequests[0].id : null,
      });
      for (const request of vendorRequests) {
        await client.query(
          `UPDATE replenishment_requests
           SET inbound_order_id = $2,
               zoho_po_id = COALESCE($3, zoho_po_id),
               zoho_po_number = COALESCE($4, zoho_po_number),
               updated_at = NOW()
           WHERE id = $1 AND organization_id = $5`,
          [request.id, landed.inboundOrderId, zohoPoId, zohoPoNumber, orgId]
        );
        await deps.transitionStatus(request.id, 'po_created', 'system', `Inbound order ${orderNumber} created`, client, orgId);
        await earmarkPoForReplenishmentRequest(client, {
          orgId,
          replenishmentRequestId: request.id,
          inboundOrderId: landed.inboundOrderId,
          zohoPoId,
          zohoPoNumber,
        });
      }
      return landed.inboundOrderId;
    });

    created.push({ vendor, inbound_order_id: inboundOrderId, order_number: orderNumber, zoho_po_id: zohoPoId, zoho_po_number: zohoPoNumber });
  }

  return created;
}

/**
 * Internal receipt state of a request's inbound order: fulfilled once the
 * order's lines for this catalog item have received what the request needs.
 */
async function reconcileInboundOrderStatus(request: ReplenishmentRequestRow, orgId: OrgId) {
  if (request.inbound_order_id == null) return;
  const received = await withTenantConnection(orgId, (c) => c.query(
    `SELECT COALESCE(SUM(rl.quantity_received), 0)::int AS total
       FROM receiving_line rl
      WHERE rl.organization_id = $1
        AND rl.inbound_order_id = $2
        AND ($3::int IS NULL OR rl.sku_catalog_id = $3)`,
    [orgId, request.inbound_order_id, request.sku_catalog_id]
  ));
  const total = toNumber(received.rows[0]?.total, 0);
  if (total > 0 && request.status === 'po_created') {
    await transitionReplenishmentStatus(request.id, 'waiting_for_receipt', 'system', null, pool, orgId);
  }
  if (total >= toNumber(request.quantity_needed, 0) && total > 0 && request.status !== 'fulfilled') {
    await transitionReplenishmentStatus(request.id, 'fulfilled', 'system', `Received ${total} units`, pool, orgId);
  }
}

async function reconcilePOStatus(request: ReplenishmentRequestRow, orgId: OrgId) {
  if (!request.zoho_po_id) return;

  const po = await withZohoOrg(orgId, () => getPurchaseOrderById(request.zoho_po_id!));
  const purchaseOrder = po.purchaseorder;
  if (!purchaseOrder) return;

  const zohoStatus = cleanText(purchaseOrder.status)?.toLowerCase();
  if (zohoStatus === 'cancelled') {
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `UPDATE replenishment_requests
         SET zoho_po_id = NULL,
             zoho_po_number = NULL,
             updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [request.id, orgId]
      );
      await transitionReplenishmentStatus(request.id, 'pending_review', 'system', 'Zoho PO cancelled', client, orgId);
    });
    return;
  }

  if (['open', 'confirmed', 'issued'].includes(zohoStatus || '') && request.status === 'po_created') {
    await transitionReplenishmentStatus(request.id, 'waiting_for_receipt', 'system', null, pool, orgId);
  }

  const receives = await withZohoOrg(orgId, () =>
    listPurchaseReceives({ purchaseorder_id: request.zoho_po_id! })
  );
  const totalReceived = (receives.purchasereceives || []).reduce((sum, receive) => {
    const lines = ((receive.line_items || []) as unknown) as Array<Record<string, unknown>>;
    const line = lines.find((entry) => String(entry.item_id || '') === String(request.zoho_item_id));
    return sum + toNumber(line?.quantity_received, 0);
  }, 0);

  // Also check local receiving lines for units received against this PO.
  let localReceived = 0;
  if (request.zoho_po_id) {
    const localResult = await withTenantConnection(orgId, (c) => c.query(
      `SELECT COALESCE(SUM(rl.quantity_received), 0)::int AS total
       FROM receiving_line_zoho rz
       JOIN receiving_line rl
         ON rl.id = rz.receiving_line_id
         AND rl.organization_id = rz.organization_id
       WHERE rz.zoho_purchaseorder_id = $1
         AND rz.zoho_item_id = $2
         AND rz.organization_id = $3
         AND rl.workflow_status = 'DONE'`,
      [request.zoho_po_id, request.zoho_item_id, orgId]
    ));
    localReceived = toNumber(localResult.rows[0]?.total, 0);
  }

  const effectiveReceived = Math.max(totalReceived, localReceived);
  if (effectiveReceived >= toNumber(request.quantity_needed, 0) && request.status !== 'fulfilled') {
    await transitionReplenishmentStatus(request.id, 'fulfilled', 'system', `Received ${effectiveReceived} units`, pool, orgId);
  }
}

export async function runReplenishmentSync(orgId: OrgId) {
  const activeRequests = await withTenantConnection(orgId, (c) => c.query(
    `SELECT * FROM replenishment_requests
     WHERE status = ANY($1::replenishment_status[]) AND organization_id = $2
     ORDER BY created_at ASC`,
    [ACTIVE_STATUSES, orgId]
  ));

  for (const request of activeRequests.rows as ReplenishmentRequestRow[]) {
    if (['po_created', 'waiting_for_receipt'].includes(request.status)) {
      // Internal orders reconcile from receiving; a legacy Zoho-only PO still reconciles from Zoho.
      if (request.inbound_order_id != null) await reconcileInboundOrderStatus(request, orgId);
      else if (request.zoho_po_id) await reconcilePOStatus(request, orgId);
    }
    await recalculateNeed(request.id, pool, orgId);
  }
}
