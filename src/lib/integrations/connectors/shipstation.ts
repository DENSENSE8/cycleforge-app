/** ShipStation connector — the sole outbound-order importer. */
import type { OrgId } from '@/lib/tenancy/constants';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import type { TransferOrderDetail, TransferOrderDetails } from '@/lib/orders-sync/types';
import type { SyncProgress } from '@/lib/orders-sync/types';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import { getShipStationV1 } from '@/lib/shipping/shipstation/config';
import type {
  ShipStationV1Client,
  ShipStationV1Order,
  ShipStationV1Shipment,
} from '@/lib/shipping/shipstation/orders-v1';
import { syncShipStationStoresToCatalog } from '@/lib/catalog/shipstation-store-sync';
import { listStoreLinks, SHIPSTATION_STORE_PROVIDER } from '@/lib/catalog/integration-store-links';
import { listPlatformAccounts, listPlatforms } from '@/lib/neon/catalog-queries';
import { buildAccountSourceLookup } from '@/lib/platform-display';
import { tenantQuery } from '@/lib/tenancy/db';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import { autoAllocateAfterIngest } from '@/lib/allocation/auto-allocate';
import { invalidateOrderViews } from '@/lib/orders/invalidation';
import { matchAggregatorOrderRows, type PlatformOf } from '@/lib/orders/order-source-match';
import {
  attachShipStationTracking,
  planShipStationTracking,
  shipStationTrackingImportRows,
  type ShipStationOrderRow,
  type ShipStationTrackingDeps,
} from './shipstation-tracking';
import {
  backfillWindows,
  buildStoreAttributions,
  bump,
  emptyCounts,
  mergeCounts,
  planShipStationOrders,
  resumeFrom,
  shipStationPlanImportRows,
  type AttributionCatalog,
  type BackfillCheckpoint,
  type ExistingOrderRow,
  type MatchKind,
  type PlannedOrder,
  type ReconcileCounts,
  type StoreAttribution,
} from './shipstation-orders';
import type { SyncOpts, SyncOutcome } from './types';
import type { ImportRowRecord } from '@/lib/imports/types';
import { importRowsFromTransferDetails } from '@/lib/imports/from-transfer-details';

/** Provenance recorded on shipment links and the refs. */
const SOURCE = 'shipstation';
/**
 * Import scope (owner 2026-09-24: "just the week's orders"): a first
 * incremental run and a default backfill reach back this far, never the full
 * ShipStation history.
 */
const IMPORT_SCOPE_DAYS = 7;
const FIRST_RUN_LOOKBACK_MS = IMPORT_SCOPE_DAYS * 24 * 60 * 60 * 1000;
/** v1's page ceiling. */
const PAGE_SIZE = 500;
/** Incremental safety bound: 25 × 500 = 12.5k orders (and shipments) per run. */
const MAX_PAGES = 25;
const BACKFILL_WINDOW_DAYS = IMPORT_SCOPE_DAYS;
/** A run row untouched this long is a dead process, not a live one. */
const STALE_RUN_MS = 15 * 60 * 1000;
/** Quarantined rows carried on the outcome for the desk's run detail. */
const MAX_DETAIL_ROWS = 200;
/** The shipments window starts this far BEFORE the orders watermark. */
const SHIPMENTS_OVERLAP_MS = 24 * 60 * 60 * 1000;

// ─── Context: store attribution + catalog placement ─────────────────────────

interface SyncContext {
  orgId: OrgId;
  client: ShipStationV1Client;
  attributions: Map<number, StoreAttribution>;
  platformOf: PlatformOf;
  progress: SyncProgress;
}

async function loadContext(orgId: OrgId, client: ShipStationV1Client, apply: boolean, progress: SyncProgress): Promise<SyncContext> {
  const stores = await client.listStores();
  // Place unlinked stores on their platforms first (additive, idempotent) so
  // attribution and the pickers read the same links.
  // Best-effort: a mirror failure must never fail the order sync.
  if (apply) {
    try {
      await syncShipStationStoresToCatalog(orgId, stores);
    } catch (e) {
      console.warn('[shipstation-sync] store catalog mirror skipped:', e);
    }
  }
  const [platforms, accounts, links, spellingRows] = await Promise.all([
    listPlatforms(orgId, { includeInactive: true }),
    listPlatformAccounts(orgId, { includeInactive: true }),
    listStoreLinks(orgId, SHIPSTATION_STORE_PROVIDER),
    tenantQuery<{ account_source: string; n: number }>(
      orgId,
      `SELECT account_source, count(*)::int AS n
         FROM orders
        WHERE organization_id = $1 AND btrim(coalesce(account_source, '')) <> ''
        GROUP BY 1`,
      [orgId],
    ),
  ]);
  const lookup = buildAccountSourceLookup(platforms, accounts);
  const platformOf: PlatformOf = (source) => lookup(source).platform?.slug.trim().toLowerCase() ?? null;
  const platformSlugById = new Map(platforms.map((p) => [String(p.id), p.slug.trim().toLowerCase()]));

  // A link naming an account that has since been retired attributes to the
  // platform (org spelling) rather than to a hidden account.
  const activeAccountSlugById = new Map(accounts.filter((a) => a.is_active).map((a) => [String(a.id), a.slug]));
  const bindings: AttributionCatalog['bindings'] = new Map(
    links.flatMap((link) => {
      const platform = platformSlugById.get(String(link.platform_id));
      if (!platform) return [];
      const accountSource =
        link.platform_account_id != null ? activeAccountSlugById.get(String(link.platform_account_id)) ?? null : null;
      return [[Number(link.external_store_id), { platform, accountSource }] as const];
    }),
  );
  const spellings = spellingRows.rows.map((r) => ({
    accountSource: r.account_source,
    platform: platformOf(r.account_source),
    count: Number(r.n),
  }));
  return { orgId, client, attributions: buildStoreAttributions(stores, { bindings, spellings }), platformOf, progress };
}

// ─── DB reads ────────────────────────────────────────────────────────────────

async function findOrderRows(orgId: OrgId, numbers: string[]): Promise<Map<string, ExistingOrderRow[]>> {
  const out = new Map<string, ExistingOrderRow[]>();
  if (numbers.length === 0) return out;
  const res = await tenantQuery<ExistingOrderRow & { order_id: string }>(
    orgId,
    `SELECT id, order_id, order_id AS "orderId", item_number AS "itemNumber", product_title AS "productTitle",
            quantity, sku, condition, notes, customer_id AS "customerId", shipment_id::int AS "shipmentId",
            account_source AS "accountSource", status, sale_amount::text AS "saleAmount", currency,
            sku_catalog_id AS "skuCatalogId"
       FROM orders
      WHERE organization_id = $1 AND order_id = ANY($2::text[])`,
    [orgId, numbers],
  );
  for (const r of res.rows) {
    const row = { ...r, id: Number(r.id) };
    const list = out.get(r.order_id);
    if (list) list.push(row);
    else out.set(r.order_id, [row]);
  }
  return out;
}

async function findIgnored(orgId: OrgId, numbers: string[]): Promise<Set<string>> {
  if (numbers.length === 0) return new Set();
  const res = await tenantQuery<{ account_order_id: string }>(
    orgId,
    `SELECT account_order_id FROM order_import_exceptions
      WHERE organization_id = $1 AND account_source = $2 AND status = 'ignored'
        AND account_order_id = ANY($3::text[])`,
    [orgId, SOURCE, numbers],
  );
  return new Set(res.rows.map((r) => r.account_order_id));
}

/** Tracking-attach IO: rows by number (any source) with their tracking and
 *  ShipStation refs, and `applyOrderTrackingOps` to set a primary. */
function makeTrackingDeps(platformOf: PlatformOf): ShipStationTrackingDeps {
  return {
    findOrders: async (orgId, orderNumbers) => {
      const res = await tenantQuery<{
        id: number;
        order_id: string;
        account_source: string | null;
        tracking: string | null;
        ss_ids: string[] | null;
      }>(
        orgId,
        `SELECT o.id, o.order_id, o.account_source, stn.tracking_number_raw AS tracking,
                (SELECT array_agg(r.shipstation_order_id::text) FROM shipstation_order_refs r
                  WHERE r.organization_id = o.organization_id AND r.order_row_id = o.id) AS ss_ids
           FROM orders o
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
          WHERE o.organization_id = $1
            AND o.order_id = ANY($2::text[])`,
        [orgId, orderNumbers],
      );
      return res.rows.map(
        (r): ShipStationOrderRow => ({
          orderNumber: r.order_id,
          orderRowId: Number(r.id),
          accountSource: r.account_source,
          currentTracking: r.tracking,
          shipStationOrderIds: (r.ss_ids ?? []).map(Number),
        }),
      );
    },
    platformOf,
    attachPrimaryTracking: async ({ orgId, orderIds, trackingNumber, carrier }) => {
      await applyOrderTrackingOps({
        orderIds,
        organizationId: orgId,
        primaryTrackingNumber: trackingNumber,
        primaryCarrier: carrier,
      });
    },
    onError: (orderNumber, error) => {
      console.warn(`[shipstation-sync] tracking attach skipped for order ${orderNumber}:`, error);
    },
  };
}

/** Row lookup + attach for label-history callers that have no sync context. */
const trackingDeps: ShipStationTrackingDeps = makeTrackingDeps(() => null);

// ─── DB writes ───────────────────────────────────────────────────────────────

function quarantineDetail(p: PlannedOrder): TransferOrderDetail {
  const primary = p.orders[0];
  const item = primary.items.find((it) => it.name || it.sku);
  return {
    orderId: p.orderNumber,
    productTitle: item?.name ?? '',
    sku: item?.sku ?? '',
    itemNumber: '',
    tracking: '',
    titleSource: 'none',
    platform: p.attribution.kind === 'platform' ? p.attribution.accountSource : null,
    quarantineReason: p.plan.outcome === 'quarantine' ? p.plan.detail : null,
  };
}

/** Park the plan's quarantines on Review; returns the OPEN exception id per order number. */
async function upsertQuarantine(orgId: OrgId, planned: readonly PlannedOrder[]): Promise<Map<string, number>> {
  const rows = planned.flatMap((p) =>
    p.plan.outcome === 'quarantine'
      ? [
          {
            number: p.orderNumber,
            reason: p.plan.reason,
            title: p.orders[0].items.find((it) => it.name)?.name ?? null,
            raw: {
              source: 'shipstation',
              detail: p.plan.detail,
              candidateSources: p.plan.candidateSources,
              shipstationOrderIds: p.orders.map((o) => o.orderId),
              storeId: p.orders[0].storeId,
              marketplace: p.orders[0].marketplace,
              orderStatus: p.orders[0].orderStatus,
            },
          },
        ]
      : [],
  );
  if (rows.length === 0) return new Map();
  const res = await tenantQuery<{ id: string; account_order_id: string }>(
    orgId,
    `INSERT INTO order_import_exceptions
       (organization_id, account_order_id, account_source, product_title, reason, raw_row, col_indices)
     SELECT $1, x.number, $2, x.title, x.reason, x.raw, '{}'::jsonb
       FROM jsonb_to_recordset($3::jsonb) AS x(number text, reason text, title text, raw jsonb)
     ON CONFLICT (organization_id, account_source, account_order_id) DO UPDATE SET
       reason       = EXCLUDED.reason,
       raw_row      = EXCLUDED.raw_row,
       product_title = COALESCE(EXCLUDED.product_title, order_import_exceptions.product_title),
       seen_count   = order_import_exceptions.seen_count + 1,
       last_seen_at = now(),
       updated_at   = now()
     WHERE order_import_exceptions.status = 'open'
     RETURNING id, account_order_id`,
    [orgId, SOURCE, JSON.stringify(rows)],
  );
  return new Map(res.rows.map((r) => [r.account_order_id, Number(r.id)]));
}

/** A quarantined order that now imported: close its exception. */
async function resolveQuarantine(orgId: OrgId, rowIdByNumber: ReadonlyMap<string, number>): Promise<void> {
  if (rowIdByNumber.size === 0) return;
  await tenantQuery(
    orgId,
    `UPDATE order_import_exceptions e
        SET status = 'resolved', resolved_order_id = x.row_id, resolved_at = now(), updated_at = now()
       FROM jsonb_to_recordset($3::jsonb) AS x(number text, row_id int)
      WHERE e.organization_id = $1 AND e.account_source = $2 AND e.status = 'open'
        AND e.account_order_id = x.number`,
    [orgId, SOURCE, JSON.stringify(Array.from(rowIdByNumber, ([number, row_id]) => ({ number, row_id })))],
  );
}

/** The pre-attribution connector's invented title counts as no title. */
async function clearPlaceholderTitles(orgId: OrgId, planned: readonly PlannedOrder[]): Promise<void> {
  const numbers = planned.filter((p) => p.line).map((p) => p.orderNumber);
  if (numbers.length === 0) return;
  await tenantQuery(
    orgId,
    `UPDATE orders SET product_title = ''
      WHERE organization_id = $1 AND order_id = ANY($2::text[])
        AND product_title = 'ShipStation order ' || order_id`,
    [orgId, numbers],
  );
}

/** Addresses in the flat key set `customers.billing_address` uses
 *  (address1/address2/city/state/postalCode/country), so one reader serves both. */
function addressJson(a: ShipStationV1Order['shipTo']) {
  if (!a) return null;
  return {
    name: a.name || null,
    company: a.company ?? null,
    phone: a.phone ?? null,
    address1: a.addressLine1,
    address2: a.addressLine2 ?? null,
    city: a.cityLocality,
    state: a.stateProvince,
    postalCode: a.postalCode,
    country: a.countryCode,
    residential: a.residential ?? null,
  };
}

async function upsertOrderRefs(
  orgId: OrgId,
  entries: ReadonlyArray<{ order: ShipStationV1Order; rowId: number; accountSource: string; match: MatchKind }>,
): Promise<void> {
  if (entries.length === 0) return;
  const payload = entries.map(({ order: o, rowId, accountSource, match }) => ({
    ss_id: o.orderId,
    order_key: o.orderKey,
    order_number: o.orderNumber.trim(),
    store_id: o.storeId,
    marketplace: o.marketplace,
    account_source: accountSource,
    row_id: rowId,
    match_kind: match,
    status: o.orderStatus,
    modify_date: o.modifyDate,
    order_total: o.orderTotal,
    amount_paid: o.amountPaid,
    tax_amount: o.taxAmount,
    shipping_amount: o.shippingAmount,
    line_items: o.items.map((it) => ({
      sku: it.sku,
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineItemKey: it.lineItemKey,
      orderItemId: it.orderItemId,
      upc: it.upc,
      imageUrl: it.imageUrl,
      options: it.options,
      adjustment: it.adjustment,
    })),
    order_date: o.orderDate,
    payment_date: o.paymentDate,
    ship_by_date: o.shipByDate,
    ship_date: o.shipDate,
    customer_username: o.customerUsername,
    customer_email: o.customerEmail,
    ship_to: addressJson(o.shipTo),
    bill_to: addressJson(o.billTo),
    customer_notes: o.customerNotes,
    internal_notes: o.internalNotes,
    gift: o.gift,
    gift_message: o.giftMessage,
    requested_service: o.requestedShippingService,
    carrier_code: o.carrierCode,
    service_code: o.serviceCode,
    weight_oz:
      o.weight == null
        ? null
        : o.weight.unit === 'pound'
          ? o.weight.value * 16
          : o.weight.unit === 'gram'
            ? o.weight.value / 28.3495
            : o.weight.value,
    dimensions: o.dimensions,
  }));
  await tenantQuery(
    orgId,
    `INSERT INTO shipstation_order_refs (
       organization_id, shipstation_order_id, order_key, order_number, store_id, marketplace,
       account_source, order_row_id, match_kind, shipstation_status, modify_date,
       order_total, amount_paid, tax_amount, shipping_amount, line_items,
       order_date, payment_date, ship_by_date, ship_date, customer_username, customer_email,
       ship_to, bill_to, customer_notes, internal_notes, gift, gift_message, requested_service,
       carrier_code, service_code, weight_oz, dimensions)
     SELECT $1, x.ss_id, x.order_key, x.order_number, x.store_id, x.marketplace,
            x.account_source, x.row_id, x.match_kind, x.status, x.modify_date,
            x.order_total, x.amount_paid, x.tax_amount, x.shipping_amount, x.line_items,
            x.order_date, x.payment_date, x.ship_by_date, x.ship_date, x.customer_username, x.customer_email,
            x.ship_to, x.bill_to, x.customer_notes, x.internal_notes, x.gift, x.gift_message, x.requested_service,
            x.carrier_code, x.service_code, x.weight_oz, x.dimensions
       FROM jsonb_to_recordset($2::jsonb) AS x(
         ss_id bigint, order_key text, order_number text, store_id bigint, marketplace text,
         account_source text, row_id int, match_kind text, status text, modify_date text,
         order_total numeric, amount_paid numeric, tax_amount numeric, shipping_amount numeric, line_items jsonb,
         order_date text, payment_date text, ship_by_date text, ship_date text, customer_username text,
         customer_email text, ship_to jsonb, bill_to jsonb, customer_notes text, internal_notes text,
         gift boolean, gift_message text, requested_service text, carrier_code text, service_code text,
         weight_oz numeric, dimensions jsonb)
     ON CONFLICT (organization_id, shipstation_order_id, order_row_id) DO UPDATE SET
       order_key = EXCLUDED.order_key, order_number = EXCLUDED.order_number,
       store_id = EXCLUDED.store_id, marketplace = EXCLUDED.marketplace,
       account_source = EXCLUDED.account_source, shipstation_status = EXCLUDED.shipstation_status,
       modify_date = EXCLUDED.modify_date, order_total = EXCLUDED.order_total,
       amount_paid = EXCLUDED.amount_paid, tax_amount = EXCLUDED.tax_amount,
       shipping_amount = EXCLUDED.shipping_amount, line_items = EXCLUDED.line_items,
       order_date = EXCLUDED.order_date, payment_date = EXCLUDED.payment_date,
       ship_by_date = EXCLUDED.ship_by_date, ship_date = EXCLUDED.ship_date,
       customer_username = EXCLUDED.customer_username, customer_email = EXCLUDED.customer_email,
       ship_to = EXCLUDED.ship_to, bill_to = EXCLUDED.bill_to,
       customer_notes = EXCLUDED.customer_notes, internal_notes = EXCLUDED.internal_notes,
       gift = EXCLUDED.gift, gift_message = EXCLUDED.gift_message,
       requested_service = EXCLUDED.requested_service, carrier_code = EXCLUDED.carrier_code,
       service_code = EXCLUDED.service_code, weight_oz = EXCLUDED.weight_oz,
       dimensions = EXCLUDED.dimensions, last_seen_at = now()`,
    [orgId, JSON.stringify(payload)],
  );
}

type ShipmentAttachStatus = 'attached' | 'already_current' | 'unmatched' | 'failed' | 'not_primary' | 'voided' | 'skipped';

async function upsertShipmentRefs(
  orgId: OrgId,
  entries: ReadonlyArray<{ shipment: ShipStationV1Shipment; status: ShipmentAttachStatus; rowId: number | null }>,
): Promise<void> {
  if (entries.length === 0) return;
  const payload = entries.map(({ shipment: s, status, rowId }) => ({
    id: s.shipmentId,
    order_id: s.orderId,
    order_number: s.orderNumber,
    row_id: rowId,
    tracking: s.trackingNumber,
    carrier: s.carrierCode,
    service: s.serviceCode,
    ship_date: s.shipDate,
    create_date: s.createDate,
    voided: s.voided,
    is_return: s.isReturnLabel,
    status,
    cost: s.shipmentCost,
    insurance: s.insuranceCost,
  }));
  await tenantQuery(
    orgId,
    `INSERT INTO shipstation_shipment_refs (
       organization_id, shipstation_shipment_id, shipstation_order_id, order_number, order_row_id,
       tracking_number, carrier_code, service_code, ship_date, create_date, voided, is_return_label,
       attach_status, shipment_cost, insurance_cost)
     SELECT $1, x.id, x.order_id, x.order_number, x.row_id, x.tracking, x.carrier, x.service,
            x.ship_date, x.create_date, x.voided, x.is_return, x.status, x.cost, x.insurance
       FROM jsonb_to_recordset($2::jsonb) AS x(
         id bigint, order_id bigint, order_number text, row_id int, tracking text, carrier text,
         service text, ship_date text, create_date text, voided boolean, is_return boolean,
         status text, cost numeric, insurance numeric)
     ON CONFLICT (organization_id, shipstation_shipment_id) DO UPDATE SET
       shipstation_order_id = EXCLUDED.shipstation_order_id, order_number = EXCLUDED.order_number,
       order_row_id = COALESCE(EXCLUDED.order_row_id, shipstation_shipment_refs.order_row_id),
       tracking_number = EXCLUDED.tracking_number, carrier_code = EXCLUDED.carrier_code,
       service_code = EXCLUDED.service_code, ship_date = EXCLUDED.ship_date,
       create_date = EXCLUDED.create_date, voided = EXCLUDED.voided,
       is_return_label = EXCLUDED.is_return_label, attach_status = EXCLUDED.attach_status,
       shipment_cost = EXCLUDED.shipment_cost, insurance_cost = EXCLUDED.insurance_cost,
       last_seen_at = now()`,
    [orgId, JSON.stringify(payload)],
  );
}

// ─── Run ledger ──────────────────────────────────────────────────────────────

interface RunRow {
  id: number;
  status: string;
  phase: 'orders' | 'shipments' | 'done';
  window_start: string | null;
  window_end: string | null;
  checkpoint_at: string | null;
  checkpoint_page: number;
  counts: Record<string, number>;
  reasons: Record<string, number>;
  updated_at: string;
}

async function startRun(
  orgId: OrgId,
  mode: 'incremental' | 'backfill',
  window: { start: Date; end: Date },
): Promise<number> {
  const res = await tenantQuery<{ id: number }>(
    orgId,
    `INSERT INTO shipstation_sync_runs (organization_id, mode, window_start, window_end, checkpoint_at)
     VALUES ($1, $2, $3, $4, $3) RETURNING id`,
    [orgId, mode, window.start.toISOString(), window.end.toISOString()],
  );
  return Number(res.rows[0].id);
}

/** A live run of either mode refuses a second concurrent one (retry-safe). */
async function findLiveRun(orgId: OrgId): Promise<RunRow | null> {
  const res = await tenantQuery<RunRow>(
    orgId,
    `SELECT * FROM shipstation_sync_runs
      WHERE organization_id = $1 AND status = 'running' AND updated_at > now() - ($2 || ' milliseconds')::interval
      ORDER BY id DESC LIMIT 1`,
    [orgId, String(STALE_RUN_MS)],
  );
  return res.rows[0] ?? null;
}

async function findResumableBackfill(orgId: OrgId): Promise<RunRow | null> {
  const res = await tenantQuery<RunRow>(
    orgId,
    `SELECT * FROM shipstation_sync_runs
      WHERE organization_id = $1 AND mode = 'backfill' AND status IN ('running', 'failed')
      ORDER BY id DESC LIMIT 1`,
    [orgId],
  );
  return res.rows[0] ?? null;
}

function countsJson(counts: ReconcileCounts, tracking: Record<string, number>) {
  return {
    imported: counts.imported,
    enriched: counts.enriched,
    skipped: counts.skipped,
    quarantined: counts.quarantined,
    ...tracking,
  };
}

async function checkpointRun(
  orgId: OrgId,
  runId: number,
  checkpoint: BackfillCheckpoint,
  counts: ReconcileCounts,
  tracking: Record<string, number>,
): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE shipstation_sync_runs
        SET phase = $3, checkpoint_at = $4, checkpoint_page = $5, counts = $6::jsonb, reasons = $7::jsonb,
            status = 'running', error = NULL, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      runId,
      orgId,
      checkpoint.phase,
      checkpoint.windowStart.toISOString(),
      checkpoint.page,
      JSON.stringify(countsJson(counts, tracking)),
      JSON.stringify(counts.reasons),
    ],
  );
}

async function finishRun(
  orgId: OrgId,
  runId: number,
  status: 'done' | 'failed',
  counts: ReconcileCounts,
  tracking: Record<string, number>,
  error?: string,
): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE shipstation_sync_runs
        SET status = $3, phase = CASE WHEN $3 = 'done' THEN 'done' ELSE phase END,
            counts = $4::jsonb, reasons = $5::jsonb, error = $6,
            updated_at = now(), finished_at = CASE WHEN $3 = 'done' THEN now() ELSE finished_at END
      WHERE id = $1 AND organization_id = $2`,
    [runId, orgId, status, JSON.stringify(countsJson(counts, tracking)), JSON.stringify(counts.reasons), error ?? null],
  );
}

// ─── One page of orders / shipments ─────────────────────────────────────────

interface PageResult {
  counts: ReconcileCounts;
  details: Pick<TransferOrderDetails, 'inserted' | 'updated'> & { quarantined: TransferOrderDetail[] };
  insertedOrderIds: number[];
  /** Every order the page wrote, parked or skipped — never truncated (applied runs only). */
  importRows: ImportRowRecord[];
}

async function processOrderPage(ctx: SyncContext, orders: readonly ShipStationV1Order[], apply: boolean): Promise<PageResult> {
  const { orgId } = ctx;
  const numbers = Array.from(new Set(orders.map((o) => o.orderNumber.trim()).filter(Boolean)));
  const [rowsByNumber, ignored] = await Promise.all([findOrderRows(orgId, numbers), findIgnored(orgId, numbers)]);
  const { planned, counts } = planShipStationOrders(orders, {
    attributions: ctx.attributions,
    rowsByNumber,
    platformOf: ctx.platformOf,
    ignored,
  });
  const quarantinedDetails = planned.filter((p) => p.plan.outcome === 'quarantine').map(quarantineDetail);
  if (!apply) {
    return {
      counts,
      details: { inserted: [], updated: [], quarantined: quarantinedDetails },
      insertedOrderIds: [],
      importRows: [],
    };
  }

  const exceptionIdByNumber = await upsertQuarantine(orgId, planned);
  const toWrite = planned.filter((p) => p.line);
  if (toWrite.length === 0) {
    return {
      counts,
      details: { inserted: [], updated: [], quarantined: quarantinedDetails },
      insertedOrderIds: [],
      importRows: shipStationPlanImportRows(planned, exceptionIdByNumber),
    };
  }
  await clearPlaceholderTitles(orgId, toWrite);

  const result = await ingestCanonicalOrders(toWrite.map((p) => p.line as CanonicalOrderLine), {
    orgId,
    source: SOURCE,
    progress: ctx.progress,
    matchOn: 'accountSourceAndOrderId',
    // The marketplace row is the record: ShipStation fills blanks and moves an
    // untouched status, never rewrites a title, never deletes a row.
    authoritative: { productTitle: false, status: true },
    manageDeadlines: false,
    collapseDuplicates: false,
    aggregator: { platformOf: ctx.platformOf },
  });
  await autoAllocateAfterIngest(result.insertedOrderIds, { orgId, source: SOURCE });

  // The writer saw a cross-platform number the plan did not (a concurrent
  // write between plan and ingest): quarantine it too.
  if (result.ambiguousOrderIds.length > 0) {
    const late = new Set(result.ambiguousOrderIds);
    const latePlanned: PlannedOrder[] = toWrite
      .filter((p) => late.has(p.orderNumber))
      .map((p) => ({
        ...p,
        plan: {
          outcome: 'quarantine',
          reason: 'shipstation_ambiguous_match',
          detail: `order ${p.orderNumber} gained rows under another platform during the sync`,
          candidateSources: [],
        },
      }));
    for (const [number, id] of await upsertQuarantine(orgId, latePlanned)) exceptionIdByNumber.set(number, id);
    counts.quarantined += latePlanned.length;
    bump(counts, 'quarantined.shipstation_ambiguous_match', latePlanned.length);
    quarantinedDetails.push(...latePlanned.map(quarantineDetail));
    planned.push(...latePlanned);
  }

  // Durable pairing: every ShipStation order → the rows it landed on.
  const after = await findOrderRows(orgId, toWrite.map((p) => p.orderNumber));
  const refs: Array<{ order: ShipStationV1Order; rowId: number; accountSource: string; match: MatchKind }> = [];
  const rowIdByNumber = new Map<string, number>();
  for (const p of toWrite) {
    if (p.plan.outcome === 'quarantine' || p.plan.outcome === 'skip') continue;
    if (result.ambiguousOrderIds.includes(p.orderNumber)) continue;
    const accountSource = p.plan.accountSource;
    const target = matchAggregatorOrderRows(accountSource, after.get(p.orderNumber) ?? [], ctx.platformOf);
    const match: MatchKind = p.plan.outcome === 'import' ? 'inserted' : p.plan.match;
    for (const row of target.rows) {
      rowIdByNumber.set(p.orderNumber, rowIdByNumber.get(p.orderNumber) ?? row.id);
      for (const order of p.orders) refs.push({ order, rowId: row.id, accountSource, match });
    }
  }
  await upsertOrderRefs(orgId, refs);
  await resolveQuarantine(orgId, rowIdByNumber);

  // Report what the writer actually did (the plan is its forecast).
  const enrichedNumbers = new Set(result.details.updated.map((d) => d.orderId));
  const sourceOf = new Map(toWrite.map((p) => [p.orderNumber, p.line?.accountSource ?? null]));
  const withPlatform = (d: TransferOrderDetail): TransferOrderDetail => ({ ...d, platform: sourceOf.get(d.orderId) ?? null });
  const applied = emptyCounts();
  applied.reasons = { ...counts.reasons };
  applied.imported = result.insertedOrders;
  applied.enriched = enrichedNumbers.size;
  applied.quarantined = counts.quarantined;
  applied.skipped = counts.skipped - (counts.reasons['skipped.unchanged'] ?? 0)
    + Math.max(0, toWrite.length - result.ambiguousOrderIds.length - result.insertedOrders - enrichedNumbers.size);
  // The ShipStation order behind each written row (the refs just upserted).
  const shipstationOrderIdByRow = new Map<number, number>();
  for (const ref of refs) {
    if (!shipstationOrderIdByRow.has(ref.rowId)) shipstationOrderIdByRow.set(ref.rowId, ref.order.orderId);
  }
  // Inserted / backfilled rows, each with the ShipStation order behind it
  // (the refs just upserted); the writer's own ambiguous bucket is the late
  // quarantine above, recorded from its plan.
  const written = importRowsFromTransferDetails(
    { inserted: result.details.inserted, updated: result.details.updated },
    {
      platformOf: ctx.platformOf,
      decorate: (d) => ({
        shipstationOrderId: d.orderRowId != null ? shipstationOrderIdByRow.get(d.orderRowId) ?? null : null,
      }),
    },
  );
  return {
    counts: applied,
    details: {
      inserted: result.details.inserted.map(withPlatform),
      updated: result.details.updated.map(withPlatform),
      quarantined: quarantinedDetails,
    },
    insertedOrderIds: result.insertedOrderIds,
    importRows: [...written, ...shipStationPlanImportRows(planned, exceptionIdByNumber)],
  };
}

async function processShipmentPage(
  ctx: SyncContext,
  shipments: readonly ShipStationV1Shipment[],
  apply: boolean,
): Promise<{ tracking: Record<string, number>; importRows: ImportRowRecord[] }> {
  const plan = planShipStationTracking(shipments);
  const tracking = await attachShipStationTracking(ctx.orgId, plan.plans, makeTrackingDeps(ctx.platformOf), {
    dryRun: !apply,
    concurrency: 6,
  });
  let importRows: ImportRowRecord[] = [];
  if (apply) {
    const byShipment = new Map(tracking.outcomes.map((o) => [o.shipmentId, o]));
    await upsertShipmentRefs(
      ctx.orgId,
      shipments.map((s) => {
        const o = byShipment.get(s.shipmentId);
        const status: ShipmentAttachStatus = s.voided
          ? 'voided'
          : !o
            ? 'not_primary'
            : o.status === 'ambiguous'
              ? 'skipped'
              : o.status;
        return { shipment: s, status, rowId: o?.orderRowIds[0] ?? null };
      }),
    );
    await invalidateOrderViews({
      organizationId: ctx.orgId,
      orderIds: tracking.attachedOrderIds,
      source: 'shipstation.tracking',
      extraTags: ['shipped'],
    });
    // The rows the labels touched, read back for the import record: their
    // account and the shipment the attach linked.
    const touchedIds = Array.from(
      new Set(tracking.outcomes.filter((o) => o.status === 'attached' || o.status === 'failed').flatMap((o) => o.orderRowIds)),
    );
    const touched = touchedIds.length
      ? await tenantQuery<{ id: number; account_source: string | null; shipment_id: string | null }>(
          ctx.orgId,
          `SELECT id, account_source, shipment_id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[])`,
          [ctx.orgId, touchedIds],
        )
      : { rows: [] };
    const rowsById = new Map(
      touched.rows.map((r) => [
        Number(r.id),
        { accountSource: r.account_source, shipmentId: r.shipment_id == null ? null : Number(r.shipment_id) },
      ]),
    );
    importRows = shipStationTrackingImportRows(shipments, tracking.outcomes, rowsById, ctx.platformOf);
  }
  return {
    tracking: {
      trackingAttached: tracking.attached,
      trackingAlreadyCurrent: tracking.alreadyCurrent,
      trackingUnmatched: tracking.unmatched,
      trackingAmbiguous: tracking.ambiguous,
      trackingFailed: tracking.failed,
      shipmentsVoided: plan.voided,
      shipmentsSkipped: plan.skipped,
    },
    importRows,
  };
}

function addTracking(into: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) into[k] = (into[k] ?? 0) + v;
  return into;
}

function outcome(
  counts: ReconcileCounts,
  tracking: Record<string, number>,
  details: PageResult['details'],
  extra: { cursor?: string; runId?: number; dryRun?: boolean; importRows: ImportRowRecord[] },
): SyncOutcome {
  const reasons = Object.fromEntries(Object.entries(counts.reasons).map(([k, v]) => [`reason.${k}`, v]));
  const fullDetails: TransferOrderDetails = {
    inserted: details.inserted,
    updated: details.updated,
    deleted: [],
    unknownTitle: [],
    unresolvedTracking: [],
    unmatchedCatalog: [],
    quarantined: details.quarantined.slice(0, MAX_DETAIL_ROWS),
  };
  return {
    ok: true,
    imported: counts.imported,
    updated: counts.enriched,
    cursor: extra.cursor,
    details: fullDetails,
    stats: {
      imported: counts.imported,
      enriched: counts.enriched,
      skipped: counts.skipped,
      quarantined: counts.quarantined,
      ...tracking,
      ...reasons,
      ...(extra.runId != null ? { runId: extra.runId } : {}),
      ...(extra.dryRun ? { dryRun: 1 } : {}),
    },
    importRows: extra.importRows,
  };
}

function mergeDetails(into: PageResult['details'], add: PageResult['details']) {
  into.inserted.push(...add.inserted.slice(0, Math.max(0, MAX_DETAIL_ROWS - into.inserted.length)));
  into.updated.push(...add.updated.slice(0, Math.max(0, MAX_DETAIL_ROWS - into.updated.length)));
  into.quarantined.push(...add.quarantined.slice(0, Math.max(0, MAX_DETAIL_ROWS - into.quarantined.length)));
}

// ─── Entry points ────────────────────────────────────────────────────────────

export async function shipstationSync(orgId: OrgId, opts?: SyncOpts): Promise<SyncOutcome> {
  const progress: SyncProgress = opts?.onProgress ?? (() => {});
  const client = await getShipStationV1(orgId);
  if (!client) {
    return {
      ok: false,
      error:
        'shipstation: legacy v1 API key/secret not configured — order pull needs the v1 credentials (v2 has no order-list endpoint).',
    };
  }
  const apply = opts?.backfill ? opts.backfill.apply === true : true;
  if (apply) {
    const live = await findLiveRun(orgId);
    if (live) return { ok: false, error: `shipstation: sync run ${live.id} is still running` };
  }
  return opts?.backfill ? backfill(orgId, client, opts.backfill, progress) : incremental(orgId, client, progress);
}

/** Re-attribute the rows the pre-attribution connector wrote as `shipstation`, whatever their age: */
async function reattributeLegacyShipStationRows(
  orgId: OrgId,
  opts: { apply?: boolean; onProgress?: SyncProgress } = {},
): Promise<SyncOutcome> {
  const apply = opts.apply === true;
  const progress: SyncProgress = opts.onProgress ?? (() => {});
  const client = await getShipStationV1(orgId);
  if (!client) return { ok: false, error: 'shipstation: v1 credentials not configured' };
  const counts = emptyCounts();
  const details: PageResult['details'] = { inserted: [], updated: [], quarantined: [] };
  const importRows: ImportRowRecord[] = [];
  try {
    const legacy = await tenantQuery<{ order_id: string }>(
      orgId,
      `SELECT DISTINCT order_id FROM orders
        WHERE organization_id = $1 AND lower(btrim(account_source)) = $2 AND btrim(coalesce(order_id, '')) <> ''`,
      [orgId, SOURCE],
    );
    const numbers = legacy.rows.map((r) => r.order_id.trim());
    const ctx = await loadContext(orgId, client, apply, progress);
    const notInShipStation: string[] = [];
    for (let i = 0; i < numbers.length; i += 50) {
      const orders: ShipStationV1Order[] = [];
      for (const orderNumber of numbers.slice(i, i + 50)) {
        const res = await client.listOrders({ orderNumber, pageSize: PAGE_SIZE });
        const exact = res.orders.filter((o) => o.orderNumber.trim() === orderNumber);
        if (exact.length === 0) notInShipStation.push(orderNumber);
        orders.push(...exact);
      }
      const page = await processOrderPage(ctx, orders, apply);
      mergeCounts(counts, page.counts);
      mergeDetails(details, page.details);
      importRows.push(...page.importRows);
      progress({ type: 'phase', phase: 'updating', count: page.counts.enriched });
    }
    counts.skipped += notInShipStation.length;
    bump(counts, 'skipped.not_in_shipstation', notInShipStation.length);
  } catch (e) {
    return { ok: false, error: `shipstation re-attribution: ${e instanceof Error ? e.message : String(e)}`, importRows };
  }
  return outcome(counts, {}, details, { dryRun: !apply, importRows });
}

async function incremental(orgId: OrgId, client: ShipStationV1Client, progress: SyncProgress): Promise<SyncOutcome> {
  const cursorKey = `shipstation:orders:${orgId}`;
  const since = (await getSyncCursor(cursorKey, orgId)) ?? new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
  const runId = await startRun(orgId, 'incremental', { start: since, end: new Date() });
  const counts = emptyCounts();
  const tracking: Record<string, number> = {};
  const details: PageResult['details'] = { inserted: [], updated: [], quarantined: [] };
  const importRows: ImportRowRecord[] = [];
  let maxModified = since.getTime();

  try {
    const ctx = await loadContext(orgId, client, true, progress);
    progress({ type: 'phase', phase: 'fetching_shipstation' });
    const orders: ShipStationV1Order[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await client.listOrders({ modifyDateStart: since.toISOString(), page, pageSize: PAGE_SIZE });
      orders.push(...res.orders);
      for (const order of res.orders) {
        const ts = order.modifyDate ? Date.parse(order.modifyDate) : NaN;
        if (Number.isFinite(ts) && ts > maxModified) maxModified = ts;
      }
      if (page >= res.pages) break;
    }
    progress({ type: 'phase', phase: 'fetching_shipstation', count: orders.length });

    // Labels over the same window (plus overlap), read BEFORE any write so a
    // feed failure fails the run cleanly and the watermark re-pulls both.
    const shipments: ShipStationV1Shipment[] = [];
    const shipmentsSince = new Date(since.getTime() - SHIPMENTS_OVERLAP_MS).toISOString();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await client.listShipments({ createDateStart: shipmentsSince, page, pageSize: PAGE_SIZE });
      shipments.push(...res.shipments);
      if (page >= res.pages) break;
    }
    progress({
      type: 'phase',
      phase: 'resolving_tracking',
      count: planShipStationTracking(shipments).plans.length,
    });

    const page = await processOrderPage(ctx, orders, true);
    mergeCounts(counts, page.counts);
    mergeDetails(details, page.details);
    importRows.push(...page.importRows);
    progress({ type: 'phase', phase: 'updating', count: counts.enriched });
    progress({ type: 'phase', phase: 'inserting', count: counts.imported });

    // After ingest, so a label on an order first seen this run finds its row.
    const labels = await processShipmentPage(ctx, shipments, true);
    addTracking(tracking, labels.tracking);
    importRows.push(...labels.importRows);

    if (maxModified > since.getTime()) await updateSyncCursor(cursorKey, new Date(maxModified), orgId);
    await finishRun(orgId, runId, 'done', counts, tracking);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finishRun(orgId, runId, 'failed', counts, tracking, message).catch(() => {});
    return { ok: false, error: `shipstation: ${message}`, importRows };
  }
  return outcome(counts, tracking, details, { cursor: new Date(maxModified).toISOString(), runId, importRows });
}

async function backfill(
  orgId: OrgId,
  client: ShipStationV1Client,
  options: NonNullable<SyncOpts['backfill']>,
  progress: SyncProgress,
): Promise<SyncOutcome> {
  const apply = options.apply === true;
  const windowDays = options.windowDays ?? BACKFILL_WINDOW_DAYS;
  const counts = emptyCounts();
  const tracking: Record<string, number> = {};
  const details: PageResult['details'] = { inserted: [], updated: [], quarantined: [] };
  const importRows: ImportRowRecord[] = [];

  // Resume an interrupted applied run on its own window; else start fresh.
  const resumable = apply && !options.restart ? await findResumableBackfill(orgId) : null;
  let start: Date;
  let end: Date;
  let checkpoint: BackfillCheckpoint | null = null;
  if (resumable?.window_start && resumable.window_end) {
    start = new Date(resumable.window_start);
    end = new Date(resumable.window_end);
    checkpoint = resumable.checkpoint_at
      ? { phase: resumable.phase, windowStart: new Date(resumable.checkpoint_at), page: resumable.checkpoint_page }
      : null;
    mergeCounts(counts, {
      imported: Number(resumable.counts.imported ?? 0),
      enriched: Number(resumable.counts.enriched ?? 0),
      skipped: Number(resumable.counts.skipped ?? 0),
      quarantined: Number(resumable.counts.quarantined ?? 0),
      reasons: resumable.reasons ?? {},
    });
    for (const [k, v] of Object.entries(resumable.counts)) {
      if (k.startsWith('tracking') || k.startsWith('shipments')) tracking[k] = Number(v);
    }
  } else {
    end = new Date();
    // Default: the import scope, not the whole ShipStation history.
    start = options.since ? new Date(options.since) : new Date(end.getTime() - FIRST_RUN_LOOKBACK_MS);
  }
  const windows = backfillWindows(start, end, windowDays);
  const runId = apply
    ? resumable
      ? resumable.id
      : await startRun(orgId, 'backfill', { start, end })
    : undefined;

  try {
    const ctx = await loadContext(orgId, client, apply, progress);
    progress({ type: 'phase', phase: 'fetching_shipstation' });
    let fetched = 0;

    // Phase 1 — orders, window by window, page by page.
    const ordersFrom = resumeFrom(windows, checkpoint, 'orders');
    for (let w = ordersFrom.windowIndex; w < windows.length; w++) {
      const window = windows[w];
      for (let page = w === ordersFrom.windowIndex ? ordersFrom.page : 1; ; page++) {
        const res = await client.listOrders({
          modifyDateStart: window.start.toISOString(),
          modifyDateEnd: window.end.toISOString(),
          page,
          pageSize: PAGE_SIZE,
        });
        fetched += res.orders.length;
        const result = await processOrderPage(ctx, res.orders, apply);
        mergeCounts(counts, result.counts);
        mergeDetails(details, result.details);
        importRows.push(...result.importRows);
        const next = page >= res.pages ? null : page + 1;
        if (runId != null) {
          const cp: BackfillCheckpoint = next
            ? { phase: 'orders', windowStart: window.start, page: next }
            : w + 1 < windows.length
              ? { phase: 'orders', windowStart: windows[w + 1].start, page: 1 }
              : { phase: 'shipments', windowStart: windows[0]?.start ?? start, page: 1 };
          await checkpointRun(orgId, runId, cp, counts, tracking);
        }
        if (!next) break;
      }
    }
    progress({ type: 'phase', phase: 'fetching_shipstation', count: fetched });
    progress({ type: 'phase', phase: 'updating', count: counts.enriched });
    progress({ type: 'phase', phase: 'inserting', count: counts.imported });

    // Phase 2 — labels, by create date over the same span.
    const shipmentsFrom = resumeFrom(windows, checkpoint, 'shipments');
    let plansSeen = 0;
    for (let w = shipmentsFrom.windowIndex; w < windows.length; w++) {
      const window = windows[w];
      for (let page = w === shipmentsFrom.windowIndex ? shipmentsFrom.page : 1; ; page++) {
        const res = await client.listShipments({
          createDateStart: window.start.toISOString(),
          createDateEnd: window.end.toISOString(),
          page,
          pageSize: PAGE_SIZE,
        });
        plansSeen += res.shipments.length;
        const labels = await processShipmentPage(ctx, res.shipments, apply);
        addTracking(tracking, labels.tracking);
        importRows.push(...labels.importRows);
        const next = page >= res.pages ? null : page + 1;
        if (runId != null) {
          const cp: BackfillCheckpoint = next
            ? { phase: 'shipments', windowStart: window.start, page: next }
            : w + 1 < windows.length
              ? { phase: 'shipments', windowStart: windows[w + 1].start, page: 1 }
              : { phase: 'done', windowStart: window.start, page: 1 };
          await checkpointRun(orgId, runId, cp, counts, tracking);
        }
        if (!next) break;
      }
    }
    progress({ type: 'phase', phase: 'resolving_tracking', count: plansSeen });
    if (runId != null) await finishRun(orgId, runId, 'done', counts, tracking);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (runId != null) await finishRun(orgId, runId, 'failed', counts, tracking, message).catch(() => {});
    return { ok: false, error: `shipstation backfill: ${message}`, stats: { ...countsJson(counts, tracking) }, importRows };
  }
  return outcome(counts, tracking, details, { runId, dryRun: !apply, importRows });
}
