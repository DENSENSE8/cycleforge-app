/**
 * Exact local orders as a Support item sees them.
 *
 * `orders` is LINE grain: `orders.id` is one line, `orders.order_id` the
 * platform order number every line of that order shares, and
 * `account_source` the storefront. One customer order = all lines with the
 * same (order_id, account_source) — the same pair the
 * `idx_orders_unique_org_account_order_line` key is built on. A line with no
 * order number is an order of its own.
 *
 * Representative id: wherever a Support surface needs ONE `orders.id` for a
 * whole order (a pasted reference's candidate, the check-in projection key),
 * it uses the LOWEST line id of the order — the first line imported. It is
 * stable (a later line never has a lower id), any line of the order maps to
 * it deterministically, and it is a real `orders.id`, so links stay exact.
 */
import type { PoolClient } from 'pg';
import { skuCatalogJoinOnSql, resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SupportOrderProduct, SupportOrderRef } from '@/lib/support/conversation/model';
import {
  loadOrderPlatformResolver,
  type OrderPlatformIdentity,
  type OrderPlatformResolver,
} from './order-platform';

export type OrderFactsQueryable = Pick<PoolClient, 'query'>;

/** Amazon-fulfilled (FBA): Amazon moves and messages it; CycleForge never touches the box. */
export const AFN_FULFILLMENT_CHANNEL = 'AFN';
export const PICKUP_FULFILLMENT_CHANNEL = 'PICKUP';

export interface OrderShipmentFact {
  shipmentId: number;
  trackingNumber: string | null;
  isDelivered: boolean;
  deliveredAt: string | null;
  carrierAcceptedAt: string | null;
  /** First dock SHIP_CONFIRM (scan-out) of this shipment. */
  shipConfirmAt: string | null;
}

/** One line as `ORDER_GROUP_LINES_SQL` returns it. */
export interface OrderLineFactRow {
  line_id: number;
  group_key: string;
  order_number: string | null;
  account_source: string | null;
  status: string | null;
  fulfillment_channel: string | null;
  quantity: string | number | null;
  sku: string | null;
  admin_url: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  item_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  /** SHIP_CONFIRM stamped on the line itself (phone / desk scan-out metadata). */
  line_ship_confirm_at: string | Date | null;
  shipments: Array<{
    id: number | string;
    tracking: string | null;
    is_delivered: boolean | null;
    delivered_at: string | null;
    carrier_accepted_at: string | null;
    ship_confirm_at: string | null;
  }> | null;
}

/** Every line of one customer order, folded. */
export interface OrderGroupFacts {
  /** Lowest line id of the order (see the module comment). */
  representativeOrderId: number;
  lineIds: number[];
  orderNumber: string | null;
  accountSource: string | null;
  platform: OrderPlatformIdentity;
  /** Distinct lowercase line statuses. */
  statuses: string[];
  /** Any line is Amazon-fulfilled (AFN) or sold through the FBA storefront. */
  anyAfn: boolean;
  /** Any line is a counter pickup. */
  pickup: boolean;
  customer: { name: string | null; email: string | null; phone: string | null };
  adminUrl: string | null;
  products: SupportOrderProduct[];
  shipments: OrderShipmentFact[];
  /** First SHIP_CONFIRM for any line or owned shipment of the order. */
  shipConfirmAt: string | null;
}

/**
 * All lines of the orders the seed line ids belong to. `$1` org, `$2` seed
 * `orders.id[]`. Shipment ownership is the same as `sqlOrderOwnsShipment`
 * (primary `orders.shipment_id` or an ORDER `shipment_links` row), spelled as
 * an id list so the STN lookup stays on its primary key.
 */
export const ORDER_GROUP_LINES_SQL = `
  WITH seed AS (
    SELECT o.id, o.order_id, COALESCE(o.account_source, '') AS acct
      FROM orders o
     WHERE o.organization_id = $1
       AND o.id = ANY($2::int[])
  ),
  lines AS (
    SELECT DISTINCT ON (o.id) o.*
      FROM seed s
      JOIN orders o
        ON o.organization_id = $1
       AND (
             o.id = s.id
          OR (NULLIF(btrim(s.order_id), '') IS NOT NULL
              AND o.order_id = s.order_id
              AND COALESCE(o.account_source, '') = s.acct)
       )
     ORDER BY o.id
  )
  SELECT l.id AS line_id,
         CASE WHEN NULLIF(btrim(l.order_id), '') IS NULL
              THEN 'line:' || l.id
              ELSE 'order:' || COALESCE(l.account_source, '') || E'\\x1f' || l.order_id
         END AS group_key,
         l.order_id AS order_number,
         l.account_source,
         l.status,
         l.fulfillment_channel,
         l.quantity,
         l.sku,
         l.admin_url,
         sc.product_title AS catalog_product_title,
         zi.name AS zoho_item_title,
         l.product_title AS item_name,
         COALESCE(NULLIF(btrim(c.customer_name), ''), NULLIF(btrim(c.display_name), ''),
                  NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), '')) AS customer_name,
         NULLIF(btrim(c.email), '') AS customer_email,
         COALESCE(NULLIF(btrim(c.phone), ''), NULLIF(btrim(c.mobile), '')) AS customer_phone,
         (SELECT min(sal.created_at)
            FROM station_activity_logs sal
           WHERE sal.organization_id = l.organization_id
             AND sal.activity_type = 'SHIP_CONFIRM'
             AND sal.order_row_id = l.id) AS line_ship_confirm_at,
         shp.shipments
    FROM lines l
    LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('l')}
    LEFT JOIN LATERAL (
      SELECT zi.name
        FROM items zi
       WHERE zi.sku = l.sku
         AND zi.organization_id = l.organization_id
       LIMIT 1
    ) zi ON TRUE
    LEFT JOIN customers c
      ON c.id = l.customer_id
     AND c.organization_id = l.organization_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', stn.id,
               'tracking', stn.tracking_number_raw,
               'is_delivered', stn.is_delivered,
               'delivered_at', stn.delivered_at,
               'carrier_accepted_at', stn.carrier_accepted_at,
               'ship_confirm_at', (
                 SELECT min(sal.created_at)
                   FROM station_activity_logs sal
                  WHERE sal.organization_id = l.organization_id
                    AND sal.activity_type = 'SHIP_CONFIRM'
                    AND sal.shipment_id = stn.id)
             ) ORDER BY stn.id) AS shipments
        FROM shipping_tracking_numbers stn
       WHERE stn.id IN (
               SELECT l.shipment_id
               UNION
               SELECT sl.shipment_id
                 FROM shipment_links sl
                WHERE sl.organization_id = l.organization_id
                  AND sl.owner_type = 'ORDER'
                  AND sl.owner_id = l.id
             )
    ) shp ON TRUE
   ORDER BY l.id`;

function iso(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function minIso(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const v of values) if (v && (best == null || Date.parse(v) < Date.parse(best))) best = v;
  return best;
}

function maxIso(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const v of values) if (v && (best == null || Date.parse(v) > Date.parse(best))) best = v;
  return best;
}

function lineQuantity(raw: string | number | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Fold line rows into customer orders. The representative id is the lowest
 * line id of each group; groups come back ordered by it.
 */
export function groupOrderLines(
  rows: readonly OrderLineFactRow[],
  resolvePlatform: OrderPlatformResolver,
): OrderGroupFacts[] {
  const byKey = new Map<string, OrderLineFactRow[]>();
  for (const row of rows) {
    const list = byKey.get(row.group_key);
    if (list) list.push(row);
    else byKey.set(row.group_key, [row]);
  }

  const groups: OrderGroupFacts[] = [];
  for (const lines of byKey.values()) {
    const sorted = [...lines].sort((a, b) => Number(a.line_id) - Number(b.line_id));
    const first = sorted[0];
    const shipmentsById = new Map<number, OrderShipmentFact>();
    for (const line of sorted) {
      for (const s of line.shipments ?? []) {
        const id = Number(s.id);
        if (!Number.isFinite(id) || shipmentsById.has(id)) continue;
        shipmentsById.set(id, {
          shipmentId: id,
          trackingNumber: s.tracking ?? null,
          isDelivered: s.is_delivered === true,
          deliveredAt: iso(s.delivered_at),
          carrierAcceptedAt: iso(s.carrier_accepted_at),
          shipConfirmAt: iso(s.ship_confirm_at),
        });
      }
    }
    const shipments = [...shipmentsById.values()];
    const withCustomer = sorted.find((l) => l.customer_email || l.customer_phone || l.customer_name) ?? null;
    groups.push({
      representativeOrderId: Number(first.line_id),
      lineIds: sorted.map((l) => Number(l.line_id)),
      orderNumber: first.order_number?.trim() || null,
      accountSource: first.account_source?.trim() || null,
      platform: resolvePlatform(first.order_number, first.account_source),
      statuses: [...new Set(sorted.map((l) => String(l.status ?? '').trim().toLowerCase()).filter(Boolean))],
      anyAfn: sorted.some(
        (l) =>
          String(l.fulfillment_channel ?? '').toUpperCase() === AFN_FULFILLMENT_CHANNEL ||
          String(l.account_source ?? '').trim().toLowerCase() === 'fba',
      ),
      pickup: sorted.some((l) => String(l.fulfillment_channel ?? '').toUpperCase() === PICKUP_FULFILLMENT_CHANNEL),
      customer: {
        name: withCustomer?.customer_name ?? null,
        email: withCustomer?.customer_email ?? null,
        phone: withCustomer?.customer_phone ?? null,
      },
      adminUrl: sorted.find((l) => l.admin_url)?.admin_url ?? null,
      products: sorted.map((l) => ({
        orderLineId: Number(l.line_id),
        sku: l.sku?.trim() || null,
        title:
          resolveSkuIdentityTitle({
            catalog_product_title: l.catalog_product_title,
            zoho_item_title: l.zoho_item_title,
            item_name: l.item_name,
            sku: l.sku,
          }) || `Line #${l.line_id}`,
        quantity: lineQuantity(l.quantity),
      })),
      shipments,
      shipConfirmAt: minIso([
        ...sorted.map((l) => iso(l.line_ship_confirm_at)),
        ...shipments.map((s) => s.shipConfirmAt),
      ]),
    });
  }
  return groups.sort((a, b) => a.representativeOrderId - b.representativeOrderId);
}

/** When the order physically left (carrier accepted or scanned out), earliest across shipments. */
export function orderShippedAt(group: OrderGroupFacts): string | null {
  return minIso([
    ...group.shipments.map((s) => s.carrierAcceptedAt ?? s.shipConfirmAt),
    group.shipConfirmAt,
  ]);
}

/** Every shipment delivered → the instant the LAST one arrived; else null. */
export function orderDeliveredAt(group: OrderGroupFacts): string | null {
  if (group.shipments.length === 0) return null;
  if (!group.shipments.every((s) => s.isDelivered && s.deliveredAt)) return null;
  return maxIso(group.shipments.map((s) => s.deliveredAt));
}

/** The fulfillment fact a Support item shows for the order. */
export function orderFulfillmentFact(group: OrderGroupFacts): NonNullable<SupportOrderRef['fulfillment']> {
  if (group.pickup && group.shipConfirmAt) {
    return { kind: 'picked_up', at: group.shipConfirmAt, trackingNumber: null };
  }
  const deliveredAt = orderDeliveredAt(group);
  if (deliveredAt) {
    const last = [...group.shipments].sort((a, b) => Date.parse(b.deliveredAt ?? '') - Date.parse(a.deliveredAt ?? ''))[0];
    return { kind: 'delivered', at: deliveredAt, trackingNumber: last?.trackingNumber ?? null };
  }
  const shippedAt = orderShippedAt(group);
  const tracking = group.shipments.find((s) => s.trackingNumber)?.trackingNumber ?? null;
  if (shippedAt) return { kind: 'shipped', at: shippedAt, trackingNumber: tracking };
  return { kind: 'pending', at: null, trackingNumber: tracking };
}

/** One group as the Support wire shape. `orderId` is the exact linked `orders.id`. */
export function supportOrderRefFromGroup(
  group: OrderGroupFacts,
  link: { orderId: number; primary: boolean; externalReference: string | null },
): SupportOrderRef {
  return {
    orderId: link.orderId,
    orderNumber: group.orderNumber,
    platform: group.accountSource,
    accountLabel: group.platform.accountLabel ?? group.accountSource,
    primary: link.primary,
    externalReference: link.externalReference,
    customerName: group.customer.name,
    customerEmail: group.customer.email,
    products: group.products,
    fulfillment: orderFulfillmentFact(group),
  };
}

/** Load and fold the orders the seed line ids belong to (one statement). */
export async function loadOrderGroups(
  q: OrderFactsQueryable,
  orgId: OrgId,
  seedOrderIds: readonly number[],
  resolvePlatform: OrderPlatformResolver,
): Promise<OrderGroupFacts[]> {
  const ids = [...new Set(seedOrderIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length === 0) return [];
  const res = await q.query<OrderLineFactRow>(ORDER_GROUP_LINES_SQL, [orgId, ids]);
  return groupOrderLines(res.rows, resolvePlatform);
}

interface ItemOrderLinkRow {
  primary_order_id: number | null;
  link_order_id: string | number | null;
  external_reference: string | null;
}

/**
 * The exact orders a Support item points at: its ORDER ticket_links plus its
 * primary order, one entry per customer order (two links into the same order
 * fold into one), the primary first.
 */
export async function readSupportOrderRefs(orgId: OrgId, supportItemId: number): Promise<SupportOrderRef[]> {
  const [resolvePlatform, loaded] = await Promise.all([
    loadOrderPlatformResolver(orgId),
    withTenantConnection(orgId, async (client) => {
      const res = await client.query<ItemOrderLinkRow>(
        `SELECT st.primary_order_id, tl.entity_id AS link_order_id, tl.external_reference
           FROM support_tickets st
           LEFT JOIN ticket_links tl
             ON tl.support_ticket_id = st.id
            AND tl.organization_id = st.organization_id
            AND tl.entity_type = 'ORDER'
          WHERE st.organization_id = $1
            AND st.id = $2
          ORDER BY tl.id`,
        [orgId, supportItemId],
      );
      const head = res.rows[0];
      const primaryOrderId = head?.primary_order_id != null ? Number(head.primary_order_id) : null;
      const links = res.rows
        .filter((r) => r.link_order_id != null)
        .map((r) => ({ orderId: Number(r.link_order_id), externalReference: r.external_reference ?? null }));
      const seeds = [...links.map((l) => l.orderId), ...(primaryOrderId != null ? [primaryOrderId] : [])];
      const lines = seeds.length > 0
        ? (await client.query<OrderLineFactRow>(ORDER_GROUP_LINES_SQL, [orgId, [...new Set(seeds)]])).rows
        : [];
      return { primaryOrderId, links, lines };
    }),
  ]);
  const { primaryOrderId, links, lines } = loaded;
  if (lines.length === 0) return [];

  const groups = groupOrderLines(lines, resolvePlatform);
  const refs: SupportOrderRef[] = [];
  for (const group of groups) {
    const inGroup = (id: number) => group.lineIds.includes(id);
    const primary = primaryOrderId != null && inGroup(primaryOrderId);
    const link = links.find((l) => inGroup(l.orderId));
    refs.push(
      supportOrderRefFromGroup(group, {
        orderId: primary && primaryOrderId != null ? primaryOrderId : (link?.orderId ?? group.representativeOrderId),
        primary,
        externalReference: link?.externalReference ?? null,
      }),
    );
  }
  const linkRank = (ref: SupportOrderRef) => {
    const i = links.findIndex((l) => l.orderId === ref.orderId);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return refs.sort((a, b) => Number(b.primary) - Number(a.primary) || linkRank(a) - linkRank(b));
}
