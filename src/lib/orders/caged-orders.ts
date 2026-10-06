/** The **cage** — reads and writes for caged → released on `orders`. */

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  PICKUP_FULFILLMENT_CHANNEL,
  evaluateReleaseGates,
  type EvaluatedReleaseGates,
  type ReleaseGateFacts,
} from './release-gates';
import { exceptionHeldSql } from './exception-membership';
import { G2_DOCUMENT_COUNT_SQL, G2_SKU_PAPERWORK_NOT_REQUIRED_SQL } from './g2-paperwork-sql';
import {
  PARCEL_FALLBACK_SELECT_SQL,
  parcelFallbackJoinSql,
  positiveOrNull,
  rememberParcelDims,
  resolveParcelWithSource,
  type ParcelFallbackColumns,
  type ParcelSource,
} from './parcel-dims';

type Client = Pick<PoolClient, 'query'>;

/** A shipping label exists for this order — **G3**. */
export const G3_LABEL_EXISTS_SQL = `EXISTS (
  SELECT 1
    FROM documents d
   WHERE d.organization_id = o.organization_id
     AND (
       (d.document_type = 'shipping_label' AND EXISTS (
          SELECT 1 FROM document_entity_links l
           WHERE l.document_id = d.id
             AND l.organization_id = o.organization_id
             AND l.entity_type = 'ORDER'
             AND l.entity_id = o.id
        ))
       OR (d.entity_type = 'SHIPPING_LABEL' AND d.entity_id = o.id)
     )
)`;

/**
 * That label was BOUGHT rather than hand-linked. G3 accepts either, so this
 * only sharpens what the form tells the operator ("bought" vs "linked") — it
 * never changes the verdict.
 */
export const G3_LABEL_PURCHASED_SQL = `EXISTS (
  SELECT 1
    FROM documents d
    JOIN document_entity_links l
      ON l.document_id = d.id
     AND l.organization_id = o.organization_id
     AND l.entity_type = 'ORDER'
     AND l.entity_id = o.id
   WHERE d.organization_id = o.organization_id
     AND d.document_type = 'shipping_label'
     AND COALESCE(d.document_data->>'source', '') IN ('shipstation_api', 'marketplace_api')
)`;

interface RawGateRow {
  id: number | string;
  order_id: string | null;
  item_number: string | null;
  sku: string | null;
  sku_catalog_id: number | string | null;
  product_title: string | null;
  quantity: string | null;
  condition: string | null;
  account_source: string | null;
  status: string | null;
  release_state: string | null;
  released_at: string | null;
  released_by: number | string | null;
  docs_not_required: boolean | null;
  sku_paperwork_not_required: boolean | null;
  fulfillment_channel: string | null;
  tracking_number: string | null;
  linked_document_count: number | string | null;
  shipping_label_linked: boolean | null;
  shipping_label_purchased: boolean | null;
  has_shipstation_ref: boolean | null;
  created_at: string | null;
  parcel_weight_oz: string | number | null;
  parcel_length_in: string | number | null;
  parcel_width_in: string | number | null;
  parcel_height_in: string | number | null;
}

type RawGateRowWithParcel = RawGateRow & ParcelFallbackColumns;

/** One caged/released order plus everything the gates and the form need. */
export interface CagedOrderRecord {
  id: number;
  orderNumber: string | null;
  itemNumber: string | null;
  /** `orders.sku` — the internal catalog key, distinct from `item_number` (the marketplace listing id). */
  sku: string | null;
  /** `orders.sku_catalog_id` — the G4 pairing fact; null = unpaired. */
  skuCatalogId: number | null;
  productTitle: string | null;
  quantity: string | null;
  condition: string | null;
  accountSource: string | null;
  /** `orders.status` free text — the auto-cage guard reads it (shipped rows never cage). */
  status: string | null;
  releaseState: string | null;
  releasedAt: string | null;
  releasedBy: number | null;
  docsNotRequired: boolean;
  /** `sku_catalog.paperwork_not_required` for this line's SKU — the SKU-level G2 exemption. */
  skuPaperworkNotRequired: boolean;
  /** `fulfillment_channel = 'PICKUP'` — walk-in / counter pickup: no label, no tracking. */
  pickup: boolean;
  trackingNumber: string | null;
  linkedDocumentCount: number;
  shippingLabelLinked: boolean;
  shippingLabelPurchased: boolean;
  /**
   * A ShipStation order is paired with this row (`shipstation_order_refs`) —
   * imports keep their platform `account_source`, so this, not the source, says
   * the rate-shop can fall back to the weight stored on the ShipStation order.
   */
  hasShipStationRef: boolean;
  createdAt: string | null;
  /**
   * The parcel the rate-shop should use: the order's own when it has one,
   * else what the product remembers (SKU, then item number) — see
   * `src/lib/orders/parcel-dims.ts`. {@link parcelSource} says which.
   */
  parcelWeightOz: number | null;
  parcelLengthIn: number | null;
  parcelWidthIn: number | null;
  parcelHeightIn: number | null;
  /** `order` = measured on this order; `sku` / `item_number` = remembered; null = none. */
  parcelSource: ParcelSource | null;
  /** The SKU / item number the remembered parcel came from. */
  parcelSourceKey: string | null;
  /** Live evaluation — always recomputed, never read back from `release_gates`. */
  gates: EvaluatedReleaseGates;
}

const GATE_SELECT = `
  SELECT
    o.id,
    o.order_id,
    o.item_number,
    o.sku,
    o.sku_catalog_id,
    o.product_title,
    o.quantity,
    o.condition,
    o.account_source,
    o.status,
    o.release_state,
    o.released_at::text            AS released_at,
    o.released_by,
    o.docs_not_required,
    o.fulfillment_channel,
    to_char(o.created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
    o.parcel_weight_oz,
    o.parcel_length_in,
    o.parcel_width_in,
    o.parcel_height_in,
    NULLIF(TRIM(COALESCE(stn.tracking_number_raw, '')), '') AS tracking_number,
    ${G2_DOCUMENT_COUNT_SQL}       AS linked_document_count,
    ${G2_SKU_PAPERWORK_NOT_REQUIRED_SQL} AS sku_paperwork_not_required,
    ${G3_LABEL_EXISTS_SQL}         AS shipping_label_linked,
    ${G3_LABEL_PURCHASED_SQL}      AS shipping_label_purchased,
    EXISTS (
      SELECT 1 FROM shipstation_order_refs ssr
       WHERE ssr.organization_id = o.organization_id AND ssr.order_row_id = o.id
    )                              AS has_shipstation_ref,
    ${PARCEL_FALLBACK_SELECT_SQL}
  FROM orders o
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  ${parcelFallbackJoinSql('o')}
`;

function factsFromRow(row: RawGateRow): ReleaseGateFacts {
  return {
    orderNumber: row.order_id,
    itemNumber: row.item_number,
    trackingNumber: row.tracking_number,
    linkedDocumentCount: Number(row.linked_document_count ?? 0),
    docsNotRequired: row.docs_not_required === true,
    skuPaperworkNotRequired: row.sku_paperwork_not_required === true,
    shippingLabelLinked: row.shipping_label_linked === true,
    shippingLabelPurchased: row.shipping_label_purchased === true,
    skuCatalogId: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
    pickup: row.fulfillment_channel === PICKUP_FULFILLMENT_CHANNEL,
  };
}

function mapRow(row: RawGateRowWithParcel): CagedOrderRecord {
  const facts = factsFromRow(row);
  const parcel = resolveParcelWithSource(
    {
      weightOz: positiveOrNull(row.parcel_weight_oz),
      lengthIn: positiveOrNull(row.parcel_length_in),
      widthIn: positiveOrNull(row.parcel_width_in),
      heightIn: positiveOrNull(row.parcel_height_in),
    },
    row,
  );
  return {
    id: Number(row.id),
    orderNumber: row.order_id,
    itemNumber: row.item_number,
    sku: row.sku,
    skuCatalogId: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
    productTitle: row.product_title,
    quantity: row.quantity,
    condition: row.condition,
    accountSource: row.account_source,
    status: row.status,
    releaseState: row.release_state,
    releasedAt: row.released_at,
    releasedBy: row.released_by == null ? null : Number(row.released_by),
    docsNotRequired: row.docs_not_required === true,
    skuPaperworkNotRequired: row.sku_paperwork_not_required === true,
    pickup: row.fulfillment_channel === PICKUP_FULFILLMENT_CHANNEL,
    trackingNumber: row.tracking_number,
    linkedDocumentCount: Number(row.linked_document_count ?? 0),
    shippingLabelLinked: row.shipping_label_linked === true,
    shippingLabelPurchased: row.shipping_label_purchased === true,
    hasShipStationRef: row.has_shipstation_ref === true,
    createdAt: row.created_at,
    parcelWeightOz: parcel.weightOz,
    parcelLengthIn: parcel.lengthIn,
    parcelWidthIn: parcel.widthIn,
    parcelHeightIn: parcel.heightIn,
    parcelSource: parcel.source,
    parcelSourceKey: parcel.sourceKey,
    gates: evaluateReleaseGates(facts),
  };
}

/** The caged set, newest first. Backed by `idx_orders_caged`. */
export async function listCagedOrders(
  orgId: OrgId,
  options: { limit?: number } = {},
): Promise<CagedOrderRecord[]> {
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
  const res = await tenantQuery<RawGateRow>(
    orgId,
    `${GATE_SELECT}
      WHERE o.organization_id = $1
        AND ${exceptionHeldSql('o')}
      ORDER BY o.id DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return res.rows.map(mapRow);
}

/** How many orders are caged — the count on the desk's Caged facet. */
export async function countCagedOrders(orgId: OrgId): Promise<number> {
  const res = await tenantQuery<{ count: string }>(
    orgId,
    `SELECT COUNT(*)::int AS count
       FROM orders
      WHERE organization_id = $1
        AND ${exceptionHeldSql()}`,
    [orgId],
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** One order with its live gate evaluation. `null` when it is not this org's. */
export async function getOrderReleaseRecord(
  orgId: OrgId,
  orderId: number,
  client?: Client,
): Promise<CagedOrderRecord | null> {
  const sql = `${GATE_SELECT} WHERE o.organization_id = $1 AND o.id = $2 LIMIT 1`;
  const run = async (c: Client) => {
    const res = await c.query<RawGateRowWithParcel>(sql, [orgId, orderId]);
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  };
  // A caller inside a write transaction passes its client so the read sees its
  // own uncommitted UPDATE — that is what makes release's re-evaluation honest.
  if (client) return run(client);
  return withTenantTransaction<CagedOrderRecord | null>(orgId, run);
}

/**
 * Batch read: the live gate records for a set of order ids. The auto-cage
 * path (`auto-cage.ts`) runs this over freshly inserted rows so the ONE rule
 * (`evaluateReleaseGates`) decides — no second SQL copy of the gate logic.
 */
export async function listOrderReleaseRecordsByIds(
  orgId: OrgId,
  orderIds: number[],
  client?: Client,
): Promise<CagedOrderRecord[]> {
  const ids = orderIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return [];
  const sql = `${GATE_SELECT} WHERE o.organization_id = $1 AND o.id = ANY($2::bigint[])`;
  const run = async (c: Client) => {
    const res = await c.query<RawGateRowWithParcel>(sql, [orgId, ids]);
    return res.rows.map(mapRow);
  };
  if (client) return run(client);
  const res = await tenantQuery<RawGateRow>(orgId, sql, [orgId, ids]);
  return res.rows.map(mapRow);
}

/** Put a freshly-typed order in the cage. Idempotent. */
export async function cageOrder(
  orgId: OrgId,
  orderId: number,
  client?: Client,
): Promise<boolean> {
  const run = async (c: Client) => {
    const res = await c.query(
      `UPDATE orders
          SET release_state = 'caged',
              released_at   = NULL,
              released_by   = NULL
        WHERE organization_id = $1
          AND id = $2
          AND COALESCE(release_state, '') <> 'released'`,
      [orgId, orderId],
    );
    return (res.rowCount ?? 0) > 0;
  };
  if (client) return run(client);
  return withTenantTransaction<boolean>(orgId, run);
}

/** Set (or clear) the G2 exemption. */
export async function setDocsNotRequired(
  orgId: OrgId,
  orderId: number,
  value: boolean,
): Promise<CagedOrderRecord | null> {
  return withTenantTransaction<CagedOrderRecord | null>(orgId, async (client) => {
    await client.query(
      `UPDATE orders
          SET docs_not_required = $3
        WHERE organization_id = $1 AND id = $2`,
      [orgId, orderId, value],
    );
    return getOrderReleaseRecord(orgId, orderId, client);
  });
}

/**
 * Mark a caged order as a counter pickup (or back to shipping). Only a held
 * order moves — a released one is working stock — and an Amazon channel
 * (`AFN` / `MFN`) is never overwritten.
 */
export async function setOrderPickup(
  orgId: OrgId,
  orderId: number,
  pickup: boolean,
): Promise<CagedOrderRecord | null> {
  return withTenantTransaction<CagedOrderRecord | null>(orgId, async (client) => {
    await client.query(
      `UPDATE orders
          SET fulfillment_channel = $3
        WHERE organization_id = $1 AND id = $2
          AND COALESCE(release_state, '') <> 'released'
          AND COALESCE(fulfillment_channel, '') IN ('', $4)`,
      [orgId, orderId, pickup ? PICKUP_FULFILLMENT_CHANNEL : null, PICKUP_FULFILLMENT_CHANNEL],
    );
    return getOrderReleaseRecord(orgId, orderId, client);
  });
}

/** One order row's line facts — the same shape `/api/orders/add` writes per line. */
export interface HeldOrderLine {
  productTitle: string;
  sku: string | null;
  skuCatalogId: number | null;
  quantity: string;
  condition: string | null;
  /** Line total, dollars (`orders.sale_amount`). */
  saleAmount: number | null;
  itemNumber: string | null;
}

/**
 * Rewrite a HELD order row's line after the intake form's draft save — the cart
 * edit (quantity, price, condition, pairing, item #) lands on the saved row, so
 * the payment amount and the floor read what the operator last set. A released
 * row is working stock and never moves (`null`); the To-ship feed's title
 * follows the row.
 */
export async function setHeldOrderLine(
  orgId: OrgId,
  orderId: number,
  line: HeldOrderLine,
): Promise<CagedOrderRecord | null> {
  return withTenantTransaction<CagedOrderRecord | null>(orgId, async (client) => {
    const updated = await client.query(
      `UPDATE orders
          SET product_title = $3,
              sku = $4,
              -- Only ever this org's catalog row; any other id writes NULL.
              sku_catalog_id = (SELECT sc.id FROM sku_catalog sc WHERE sc.organization_id = $1 AND sc.id = $5),
              quantity = $6,
              condition = $7,
              sale_amount = $8,
              item_number = $9
        WHERE organization_id = $1 AND id = $2
          AND COALESCE(release_state, '') <> 'released'`,
      [orgId, orderId, line.productTitle, line.sku, line.skuCatalogId ?? null, line.quantity, line.condition, line.saleAmount, line.itemNumber],
    );
    if ((updated.rowCount ?? 0) === 0) return null;
    await client.query(
      `UPDATE feed_memberships
          SET title = $3, updated_at = NOW()
        WHERE organization_id = $1::uuid AND feed_key = 'orders_unshipped'
          AND entity_type = 'ORDER' AND entity_id = $2::bigint`,
      [orgId, orderId, line.productTitle],
    );
    return getOrderReleaseRecord(orgId, orderId, client);
  });
}

/** Persist the physical parcel on the order (weight oz + optional L×W×H inch). */
export async function setOrderParcel(
  orgId: OrgId,
  orderId: number,
  parcel: {
    weightOz: number | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
  },
  opts: { staffId?: number | null } = {},
): Promise<CagedOrderRecord | null> {
  const clean = (v: number | null): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  const values = {
    weightOz: clean(parcel.weightOz),
    lengthIn: clean(parcel.lengthIn),
    widthIn: clean(parcel.widthIn),
    heightIn: clean(parcel.heightIn),
  };
  return withTenantTransaction<CagedOrderRecord | null>(orgId, async (client) => {
    const updated = await client.query<{
      sku: string | null;
      item_number: string | null;
      sku_catalog_id: number | string | null;
    }>(
      `UPDATE orders
          SET parcel_weight_oz = $3,
              parcel_length_in = $4,
              parcel_width_in  = $5,
              parcel_height_in = $6
        WHERE organization_id = $1 AND id = $2
        RETURNING sku, item_number, sku_catalog_id`,
      [orgId, orderId, values.weightOz, values.lengthIn, values.widthIn, values.heightIn],
    );
    const order = updated.rows[0];
    if (order) {
      await rememberParcelDims(client, {
        orgId,
        orderId,
        sku: order.sku,
        itemNumber: order.item_number,
        skuCatalogId: order.sku_catalog_id == null ? null : Number(order.sku_catalog_id),
        parcel: values,
        staffId: opts.staffId ?? null,
      });
    }
    return getOrderReleaseRecord(orgId, orderId, client);
  });
}

export class ReleaseGatesNotMetError extends Error {
  readonly gates: EvaluatedReleaseGates;
  constructor(gates: EvaluatedReleaseGates) {
    super(`release gates not met: ${gates.failing.map((g) => g.id).join(', ')}`);
    this.name = 'ReleaseGatesNotMetError';
    this.gates = gates;
  }
}

/** Release one order out of the cage. */
export async function releaseOrder(
  orgId: OrgId,
  orderId: number,
  staffId: number | null,
): Promise<CagedOrderRecord | null> {
  return withTenantTransaction<CagedOrderRecord | null>(orgId, async (client) => {
    const current = await getOrderReleaseRecord(orgId, orderId, client);
    if (!current) return null;
    if (current.releaseState === 'released') return current;
    if (!current.gates.canRelease) throw new ReleaseGatesNotMetError(current.gates);

    await client.query(
      `UPDATE orders
          SET release_state = 'released',
              released_at   = NOW(),
              released_by   = $3,
              release_gates = $4::jsonb
        WHERE organization_id = $1 AND id = $2`,
      [orgId, orderId, staffId, JSON.stringify(current.gates)],
    );

    return getOrderReleaseRecord(orgId, orderId, client);
  });
}
