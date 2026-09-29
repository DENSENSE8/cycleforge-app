import 'server-only';

/**
 * Create an order — the ONE server path behind `POST /api/orders/add` and the
 * assistant's `create_manual_order` (handoff `HANDOFF-manual-phone-order.md`,
 * gaps 1, 3 and 4).
 *
 *  - `createOrder` is the route's whole body: validate (`parseOrderCreateBody`),
 *    plan ceiling, duplicate check (409 on an existing order number), catalog
 *    resolve, tracking registration, then ONE tenant transaction that writes
 *    the customer (existing or new) and every line under the same order
 *    number, then views / audit / enrichment after commit.
 *  - `createManualOrderInTx` is the same insert for an order already drafted
 *    from the chat (phone or any sales channel), run inside the agent-mutation
 *    review transaction so the confirmation and the write commit together.
 *
 * Every statement carries `organization_id` from the caller's context — never
 * from the body, never from a model.
 */

import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import type { AuthContext } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { autoAllocateAfterIngest } from '@/lib/allocation/auto-allocate';
import { wouldExceedPlanCeiling, planLimitResponseBody } from '@/lib/billing/plan-ceilings';
import { getOrgTypes } from '@/lib/catalog/org-catalog';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { insertCustomerInTx, setCustomerShipToInTx } from '@/lib/neon/customer-queries';
import { resolveOrCreateSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';
import { upsertOrderUnshippedMembership } from '@/lib/orders/feed-membership-projection';
import { invalidateOrderViews } from '@/lib/orders/invalidation';
import {
  formatManualOrderNumber,
  isGeneratedOrderNumber,
  manualOrderTotals,
  orderChannelKind,
  orderNumberPrefix,
  type ManualOrderDraft,
  type ManualOrderTotals,
} from '@/lib/orders/manual-order-draft';
import { parseTrackingPaste } from '@/lib/receiving/tracking-paste';
import type { OrderCreateCustomer, OrderCreateInput } from '@/lib/schemas/order-create';
import { linkShipment } from '@/lib/shipping/shipment-links';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

type Row = Record<string, unknown>;
/** A tenant transaction's client (or a test fake) — only `query` is used. */
export type OrderTxClient = Pick<PoolClient, 'query'>;

export interface OrderCreateActor {
  organizationId: OrgId;
  staffId: number | null;
  /** The request's auth context + headers, for the audit row. Absent on the assistant path. */
  auth?: AuthContext | null;
  req?: Pick<NextRequest, 'headers'> | null;
  idempotencyKey?: string | null;
  /** `orders.add` for the route, `assistant.manual_order` for the chat. */
  source: string;
}

/** What committed — the after-commit hooks' input. */
export interface OrderCreatedEvent {
  actor: OrderCreateActor;
  orderPks: number[];
  rows: Row[];
  skuCatalogIds: Array<number | null>;
  shipmentId: number | null;
  status: string | null;
  customerId: number | null;
  customerCreated: boolean;
}

export interface CreateOrderDeps {
  query: (orgId: OrgId, text: string, params: unknown[]) => Promise<{ rows: Row[] }>;
  transaction: <T>(orgId: OrgId, fn: (client: OrderTxClient) => Promise<T>) => Promise<T>;
  planCeilingExceeded: (orgId: OrgId) => Promise<boolean>;
  orgTypes: (orgId: OrgId) => Promise<ReadonlyArray<{ id: number; slug: string }>>;
  resolveSkuCatalogId: typeof resolveOrCreateSkuCatalogId;
  registerShipment: (trackingNumber: string, orgId: OrgId) => Promise<number | null>;
  linkShipment: (orgId: OrgId, input: Parameters<typeof linkShipment>[1], client: OrderTxClient) => Promise<unknown>;
  afterCommit: (event: OrderCreatedEvent) => Promise<void>;
}

/** Allocation, views, audit and the shipped-table enrichment for rows that just committed. */
export async function announceOrderCreated(event: OrderCreatedEvent): Promise<void> {
  const { actor } = event;
  // Reserve stocked units before the views refresh, so the new order lands on
  // the phone's directed pick feed (it reads `order_unit_allocations`) in the
  // same beat it lands on To ship — the writer every ingest path already uses.
  await autoAllocateAfterIngest(event.orderPks, {
    orgId: actor.organizationId,
    staffId: typeof actor.staffId === 'number' && actor.staffId > 0 ? actor.staffId : null,
    source: actor.source,
  });
  await invalidateOrderViews({
    organizationId: actor.organizationId,
    orderIds: event.orderPks,
    source: actor.source,
    extraTags: ['shipped', 'unshipped'],
  });
  const actorOverrides = actor.auth
    ? {}
    : { method: 'system' as const, actorStaffIdOverride: actor.staffId, organizationIdOverride: actor.organizationId };
  if (event.customerCreated && event.customerId != null) {
    await recordAudit(pool, actor.auth ?? null, actor.req ?? null, {
      source: actor.source,
      action: AUDIT_ACTION.CUSTOMER_CREATE,
      entityType: AUDIT_ENTITY.CUSTOMER,
      entityId: event.customerId,
      before: null,
      after: { orderId: event.rows[0]?.order_id ?? null },
      ...actorOverrides,
    });
  }
  // Inside the idempotency claim on the route: a replayed key returns the
  // cached body and writes no second audit row, exactly as it writes no second order.
  for (let i = 0; i < event.rows.length; i += 1) {
    const row = event.rows[i];
    await recordAudit(pool, actor.auth ?? null, actor.req ?? null, {
      source: actor.source === 'orders.add' ? 'orders-add-api' : actor.source,
      action: AUDIT_ACTION.ORDER_CREATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: Number(row.id),
      before: null,
      after: {
        orderId: row.order_id,
        sku: row.sku,
        skuCatalogId: event.skuCatalogIds[i] ?? null,
        shipmentId: event.shipmentId,
        status: event.status,
        idempotencyKey: actor.idempotencyKey ?? null,
        ...(event.customerId != null ? { customerId: event.customerId } : {}),
      },
      ...actorOverrides,
    });
  }
  // A new order can newly match an already-packed scan by tracking — refresh
  // the shipped-table read model for any affected PACK scans (best-effort).
  after(() =>
    recomputeEnrichmentForOrders(pool, event.orderPks).catch((e) =>
      console.warn(`[${actor.source}] enrichment recompute failed`, e),
    ),
  );
}

const defaultDeps: CreateOrderDeps = {
  query: async (orgId, text, params) => ({ rows: (await tenantQuery(orgId, text, params)).rows as Row[] }),
  transaction: (orgId, fn) => withTenantTransaction(orgId, fn),
  planCeilingExceeded: (orgId) => wouldExceedPlanCeiling(orgId, 'maxMonthlyOrders'),
  orgTypes: getOrgTypes,
  resolveSkuCatalogId: resolveOrCreateSkuCatalogId,
  registerShipment: async (trackingNumber, orgId) => {
    // Permissive register, no live carrier sync. resolveShipmentId would
    // UPS-sync a 1Z test number into EXCEPTION and SHIPPED_BY_CARRIER_SQL
    // would hide the row from To Ship pending.
    const permissive = await registerShipmentPermissive(
      { trackingNumber, sourceSystem: 'orders.add', syncCarrier: false },
      orgId,
    );
    return permissive?.id ?? null;
  },
  linkShipment: (orgId, input, client) => linkShipment(orgId, input, client as PoolClient),
  afterCommit: announceOrderCreated,
};

// ─── the transaction's writes (shared by both paths) ─────────────────────────

export interface OrderRowsPlan {
  orderId: string;
  accountSource: string;
  status: string | null;
  currency: string;
  typeId: number | null;
  isUrgent: boolean;
  lines: Array<{
    productTitle: string;
    sku: string | null;
    skuCatalogId: number | null;
    quantity: string | null;
    condition: string | null;
    /** Line total, dollars. */
    saleAmount: number | null;
    /** `orders.item_number` — the marketplace listing it sold from. */
    itemNumber?: string | null;
  }>;
  shipmentIds: number[];
  customerId: number | null;
  /** `YYYY-MM-DD` → `work_assignments.deadline_at`. */
  shipBy: string | null;
  buyerNote: string | null;
  /** Insert held in the cage (`release_state = 'caged'`) — the phone-order path. */
  caged: boolean;
  parcel: { weightOz: number | null; lengthIn: number | null; widthIn: number | null; heightIn: number | null } | null;
  /** `orders.fulfillment_channel` — `'PICKUP'` for a walk-in / counter pickup, else null. */
  fulfillmentChannel: 'PICKUP' | null;
}

/**
 * Every line under one order number: line 1 keeps `external_line_id = ''`
 * (every single-line order ever written), later lines `line-2`, `line-3`…, so
 * `(organization_id, order_id, account_source, external_line_id)` stays unique.
 */
export async function insertOrderRowsInTx(
  client: OrderTxClient,
  orgId: OrgId,
  staffId: number | null,
  plan: OrderRowsPlan,
  link: CreateOrderDeps['linkShipment'],
  source: string,
): Promise<Row[]> {
  const shipmentId = plan.shipmentIds[0] ?? null;
  const rows: Row[] = [];
  for (let n = 0; n < plan.lines.length; n += 1) {
    const line = plan.lines[n];
    const inserted = await client.query(
      `INSERT INTO orders (
          order_id, product_title, sku, account_source, status, created_at,
          sku_catalog_id, sale_amount, currency, organization_id, shipment_id,
          condition, type_id, is_urgent, quantity, external_line_id,
          customer_id, buyer_note, release_state,
          parcel_weight_oz, parcel_length_in, parcel_width_in, parcel_height_in, item_number, fulfillment_channel
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9::uuid, $10, $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20, $21, $22, $23, $24)
        RETURNING id, order_id, product_title, sku, shipment_id, condition, quantity, created_at`,
      [
        plan.orderId,
        line.productTitle,
        line.sku || null,
        plan.accountSource,
        plan.status,
        line.skuCatalogId,
        line.saleAmount,
        plan.currency,
        orgId,
        shipmentId,
        line.condition,
        plan.typeId,
        plan.isUrgent,
        line.quantity,
        n === 0 ? '' : `line-${n + 1}`,
        plan.customerId,
        plan.buyerNote,
        plan.caged ? 'caged' : null,
        plan.parcel?.weightOz ?? null,
        plan.parcel?.lengthIn ?? null,
        plan.parcel?.widthIn ?? null,
        plan.parcel?.heightIn ?? null,
        line.itemNumber || null,
        plan.fulfillmentChannel,
      ],
    );
    const row = inserted.rows[0] as Row;
    const orderPk = Number(row.id);
    for (let i = 0; i < plan.shipmentIds.length; i += 1) {
      await link(
        orgId,
        {
          ownerType: 'ORDER',
          ownerId: orderPk,
          shipmentId: plan.shipmentIds[i],
          direction: 'OUTBOUND',
          isPrimary: i === 0,
          role: i === 0 ? 'ORDER_PRIMARY' : 'ORDER_EXTRA',
          source,
          linkedBy: staffId,
        },
        client,
      );
    }
    await client.query(
      `INSERT INTO work_assignments
           (organization_id, entity_type, entity_id, work_type, assigned_tech_id, status, priority, deadline_at)
         VALUES ($1, 'ORDER', $2, 'TEST', NULL, 'OPEN', 100, $3)
         ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
      [orgId, orderPk, plan.shipBy],
    );
    await upsertOrderUnshippedMembership(client, {
      orgId,
      orderPk,
      shipmentId,
      title: String(row.product_title ?? line.productTitle),
    });
    rows.push(row);
  }
  return rows;
}

/**
 * The order's customer: an existing row of THIS org (its ship-to updated with
 * whatever was given), or a new one. `null` = none given.
 */
export async function resolveOrderCustomerInTx(
  client: OrderTxClient,
  orgId: OrgId,
  customer: OrderCreateCustomer | null,
): Promise<{ ok: true; id: number | null; created: boolean } | { ok: false; error: string }> {
  if (!customer) return { ok: true, id: null, created: false };
  if (customer.id != null) {
    const found = await setCustomerShipToInTx(client, orgId, customer.id, {
      address1: '',
      address2: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      ...customer.shipTo,
    });
    return found ? { ok: true, id: customer.id, created: false } : { ok: false, error: 'Customer not found' };
  }
  const created = await insertCustomerInTx(client, orgId, {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    shipTo: customer.shipTo,
  });
  return { ok: true, id: created.id, created: true };
}

// ─── POST /api/orders/add ────────────────────────────────────────────────────

export type OrderCreateResult = { status: number; body: Record<string, unknown> };

const DUPLICATE_SQL = `SELECT id, order_id FROM orders WHERE organization_id = $1 AND order_id = $2 LIMIT 1`;
const CATALOG_BY_ID_SQL = `SELECT id, sku FROM sku_catalog WHERE organization_id = $1 AND id = $2 LIMIT 1`;

export async function createOrder(
  actor: OrderCreateActor,
  input: OrderCreateInput,
  deps: CreateOrderDeps = defaultDeps,
): Promise<OrderCreateResult> {
  const orgId = actor.organizationId;

  let typeId: number | null = null;
  if (input.typeSlug) {
    const types = await deps.orgTypes(orgId);
    typeId = types.find((t) => t.slug.toUpperCase() === input.typeSlug)?.id ?? null;
  }

  // Soft plan ceiling: manual order creation checks maxMonthlyOrders.
  // Dormant until PLAN_FEATURE_ENFORCED; dogfood org exempt; fail-open
  // (see plan-ceilings.ts). High-volume webhook/cron ingestion is NOT gated.
  if (await deps.planCeilingExceeded(orgId)) {
    return { status: 403, body: planLimitResponseBody('maxMonthlyOrders') };
  }

  const existing = await deps.query(orgId, DUPLICATE_SQL, [orgId, input.orderId]);
  if (existing.rows.length > 0) {
    return {
      status: 409,
      body: { error: 'Order with this order ID already exists', existingOrderId: existing.rows[0].order_id },
    };
  }

  const lines: OrderRowsPlan['lines'] = [];
  for (let i = 0; i < input.lines.length; i += 1) {
    const line = input.lines[i];
    let skuCatalogId: number | null;
    let sku = line.sku;
    if (line.skuCatalogId != null) {
      const catalog = (await deps.query(orgId, CATALOG_BY_ID_SQL, [orgId, line.skuCatalogId])).rows[0];
      if (!catalog) {
        return { status: 400, body: { error: `Line ${i + 1}: that product is not in this catalog` } };
      }
      skuCatalogId = Number(catalog.id);
      sku = sku ?? (typeof catalog.sku === 'string' ? catalog.sku : null);
    } else {
      skuCatalogId = await deps.resolveSkuCatalogId(
        { sku, productTitle: line.productTitle, accountSource: input.accountSource, orderId: input.orderId },
        orgId,
      );
    }
    lines.push({
      productTitle: line.productTitle,
      sku,
      skuCatalogId,
      quantity: line.quantity,
      condition: line.condition,
      saleAmount: line.saleAmount,
    });
  }

  // Link tracking numbers to shipments BEFORE the insert, so a resolver
  // failure aborts cleanly instead of leaving a half-created order.
  const parsedTrackings = input.trackingBlobs.length
    ? parseTrackingPaste(input.trackingBlobs)
    : { ok: false as const, error: 'empty' };
  const trackingList = parsedTrackings.ok ? parsedTrackings.trackings : [];
  const shipmentIds: number[] = [];
  for (const trackingRaw of trackingList) {
    try {
      const id = await deps.registerShipment(trackingRaw, orgId);
      if (id != null) shipmentIds.push(id);
    } catch (err) {
      console.error('[orders/add] shipment resolution failed', err);
      return {
        status: 502,
        body: {
          error:
            'Could not link that tracking number. The order was not created — check the tracking number and try again.',
        },
      };
    }
  }

  const committed = await deps.transaction(orgId, async (client) => {
    const customer = await resolveOrderCustomerInTx(client, orgId, input.customer);
    if (!customer.ok) return { error: customer.error } as const;
    const rows = await insertOrderRowsInTx(
      client,
      orgId,
      actor.staffId,
      {
        orderId: input.orderId,
        accountSource: input.accountSource,
        status: input.status,
        currency: input.currency,
        typeId,
        isUrgent: input.isUrgent,
        lines,
        shipmentIds,
        customerId: customer.id,
        shipBy: input.shipBy,
        buyerNote: input.buyerNote,
        caged: false,
        parcel: null,
        fulfillmentChannel: input.pickup ? 'PICKUP' : null,
      },
      deps.linkShipment,
      actor.source,
    );
    return { rows, customerId: customer.id, customerCreated: customer.created } as const;
  });
  if ('error' in committed) return { status: 400, body: { error: committed.error } };

  const { rows } = committed;
  const orderPks = rows.map((r) => Number(r.id));
  await deps.afterCommit({
    actor,
    orderPks,
    rows,
    skuCatalogIds: lines.map((l) => l.skuCatalogId),
    shipmentId: shipmentIds[0] ?? null,
    status: input.status,
    customerId: committed.customerId,
    customerCreated: committed.customerCreated,
  });

  return {
    status: 200,
    body: {
      success: true,
      message: 'Order added successfully',
      order: {
        ...rows[0],
        shipping_tracking_number: trackingList[0] ?? null,
        tracking_number: trackingList[0] ?? null,
        created_at: new Date().toISOString(),
        deadline_at: input.shipBy,
        has_pick_scan: false,
        is_out_of_stock: false,
        is_urgent: input.isUrgent,
        account_source: input.accountSource,
        status: input.status,
      },
      orderIds: orderPks,
      customerId: committed.customerId,
    },
  };
}

// ─── the chat's phone order (inside the review transaction) ──────────────────

/** The creation contract handed to the payment rail and the chat card. */
export interface ManualOrderCreated extends ManualOrderTotals {
  orderNumber: string;
  orderIds: number[];
  customerId: number | null;
  customerCreated: boolean;
  lines: Array<{ sku: string; title: string; qty: number; unitPriceCents: number | null }>;
  currency: string;
}

export class ManualOrderRefused extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

/**
 * `<prefix><n>` → the next n. The prefix is a bound parameter; only the
 * digits after it count, so `PH-000123` and `PH-12` share one sequence.
 */
const MANUAL_SEQ_SQL = `SELECT COALESCE(MAX(substring(order_id FROM length($2) + 1)::bigint), 0) + 1 AS next
  FROM orders
 WHERE organization_id = $1
   AND left(order_id, length($2)) = $2
   AND substring(order_id FROM length($2) + 1) ~ '^\\d{1,9}$'`;

/** The next free number under a channel prefix, `<prefix>000123` (a preview; a 409 on create asks again). */
export async function nextManualOrderNumber(
  orgId: OrgId,
  prefix: string,
  query: CreateOrderDeps['query'] = defaultDeps.query,
): Promise<string> {
  const next = Number((await query(orgId, MANUAL_SEQ_SQL, [orgId, prefix])).rows[0]?.next ?? 1);
  return formatManualOrderNumber(prefix, next);
}

/**
 * The draft's tracking as a shipment id — registered permissively (no carrier
 * sync), before the order insert, exactly as `createOrder` does. `[]` when the
 * draft carries none (buy a label later) or it is not a tracking number.
 */
export async function registerDraftTracking(
  orgId: OrgId,
  draft: Pick<ManualOrderDraft, 'trackingNumber'>,
  register: CreateOrderDeps['registerShipment'] = defaultDeps.registerShipment,
): Promise<number[]> {
  const tracking = draft.trackingNumber.trim();
  if (!tracking) return [];
  const id = await register(tracking, orgId);
  return id == null ? [] : [id];
}

const CATALOG_LINES_SQL = `SELECT sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1 AND sc.id = ANY($2::int[])`;

/**
 * Write a chat-drafted order: customer, every line (caged), ship-by, parcel,
 * item numbers and the tracking's shipment. SKU and title of a catalog line
 * are re-read from THIS org's catalog — the payload only names catalog ids; a
 * marketplace line may instead stand on its listing's item number (pairing is
 * a release gate, not a create gate). A generated number that was taken
 * meanwhile is re-generated under a per-org lock; a typed one that exists is a
 * 409. `shipmentIds` are the draft's tracking, registered by the caller.
 */
export async function createManualOrderInTx(
  client: OrderTxClient,
  orgId: OrgId,
  staffId: number | null,
  draft: ManualOrderDraft,
  link: CreateOrderDeps['linkShipment'] = defaultDeps.linkShipment,
  shipmentIds: number[] = [],
): Promise<ManualOrderCreated> {
  if (draft.lines.length === 0) throw new ManualOrderRefused(400, 'The order has no products.');
  const marketplace = orderChannelKind(draft) === 'marketplace';
  if (!draft.channel.trim()) throw new ManualOrderRefused(400, 'The order has no sales channel.');
  draft.lines.forEach((l, i) => {
    if (l.skuCatalogId != null) return;
    if (!marketplace) throw new ManualOrderRefused(400, 'Every line must be a catalog product.');
    if (!l.itemNumber) throw new ManualOrderRefused(400, `Line ${i + 1} needs a catalog product or its listing's item number.`);
  });
  if (marketplace && (draft.orderNumberGenerated || !draft.orderNumber.trim())) {
    throw new ManualOrderRefused(400, 'A marketplace order needs the marketplace\'s order number.');
  }
  const ids = draft.lines.flatMap((l) => (l.skuCatalogId == null ? [] : [l.skuCatalogId]));

  // One writer per org picks generated numbers at a time; the lock ends with the transaction.
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text || ':phone-order-number'))`, [orgId]);
  const prefix = orderNumberPrefix(draft.channel);
  let orderNumber = draft.orderNumber.trim();
  const taken = async (n: string) => (await client.query(DUPLICATE_SQL, [orgId, n])).rows.length > 0;
  if (!orderNumber || (draft.orderNumberGenerated && isGeneratedOrderNumber(prefix, orderNumber) && (await taken(orderNumber)))) {
    const next = Number((await client.query(MANUAL_SEQ_SQL, [orgId, prefix])).rows[0]?.next ?? 1);
    orderNumber = formatManualOrderNumber(prefix, next);
  } else if (await taken(orderNumber)) {
    throw new ManualOrderRefused(409, `Order ${orderNumber} already exists.`);
  }

  const catalog = new Map<number, Row>();
  if (ids.length > 0) {
    for (const row of (await client.query(CATALOG_LINES_SQL, [orgId, ids])).rows as Row[]) catalog.set(Number(row.id), row);
  }
  const lines = draft.lines.map((line, i) => {
    if (line.skuCatalogId == null) return line;
    const row = catalog.get(Number(line.skuCatalogId));
    if (!row) throw new ManualOrderRefused(404, `Line ${i + 1}: that product is not in this catalog.`);
    const sku = String(row.sku ?? '');
    const title =
      resolveSkuIdentityTitle({
        zoho_item_title: row.zoho_item_title as string | null,
        catalog_product_title: row.catalog_product_title as string | null,
        sku,
      }) || sku;
    return { ...line, sku, title };
  });

  const c = draft.customer;
  const customer = await resolveOrderCustomerInTx(
    client,
    orgId,
    c.id != null
      ? { id: c.id, shipTo: c.shipTo }
      : { name: c.name, phone: c.phone, email: c.email, shipTo: c.shipTo },
  );
  if (!customer.ok) throw new ManualOrderRefused(404, customer.error);

  const rows = await insertOrderRowsInTx(
    client,
    orgId,
    staffId,
    {
      orderId: orderNumber,
      accountSource: draft.channel,
      status: 'unassigned',
      currency: draft.currency,
      typeId: null,
      isUrgent: draft.isUrgent,
      lines: lines.map((l) => ({
        productTitle: l.title,
        sku: l.sku || null,
        skuCatalogId: l.skuCatalogId,
        quantity: String(l.quantity),
        condition: l.condition,
        saleAmount: l.unitPriceCents == null ? null : (l.unitPriceCents * l.quantity) / 100,
        itemNumber: l.itemNumber || null,
      })),
      shipmentIds,
      customerId: customer.id,
      shipBy: draft.shipBy,
      buyerNote: draft.buyerNote || null,
      caged: true,
      parcel: draft.parcel,
      fulfillmentChannel: null,
    },
    link,
    'assistant.manual_order',
  );

  return {
    orderNumber,
    orderIds: rows.map((r) => Number(r.id)),
    customerId: customer.id,
    customerCreated: customer.created,
    lines: lines.map((l) => ({ sku: l.sku, title: l.title, qty: l.quantity, unitPriceCents: l.unitPriceCents })),
    currency: draft.currency,
    ...manualOrderTotals(lines),
  };
}

/**
 * An order's lines read back by number — titles through the identity law
 * (catalog joined with `skuCatalogJoinOnSql`, the Zoho item governs).
 */
export async function readOrderLines(
  orgId: OrgId,
  orderNumber: string,
  query: CreateOrderDeps['query'] = defaultDeps.query,
): Promise<Row[]> {
  const { rows } = await query(
    orgId,
    `SELECT o.id, o.order_id, o.sku, o.product_title, o.quantity, o.sale_amount, o.currency, o.customer_id, o.release_state, o.shipment_id,
            i.name AS zoho_item_title, sc.product_title AS catalog_product_title
       FROM orders o
       LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('o')}
       LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                        AND i.organization_id = sc.organization_id AND i.status = 'active'
      WHERE o.organization_id = $1 AND o.order_id = $2
      ORDER BY o.id`,
    [orgId, orderNumber],
  );
  return rows;
}
