/** `ingestCanonicalOrders` — the ONE domain writer for order ingest. */
import { and, desc, eq, inArray } from 'drizzle-orm';
import pool from '@/lib/db';
import { db } from '@/lib/drizzle/db';
import { customers as customersTable, orders as ordersTable } from '@/lib/drizzle/schema';
import { withTenantDrizzle } from '@/lib/drizzle/tenant-db';
import { transitionalDogfoodOrgId, tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { linkShipment } from '@/lib/shipping/shipment-links';
import {
  batchPlatformItemIdsByCatalogIds,
  batchResolveSkuCatalogByTitles,
  type SkuCatalogTitleMatch,
} from '@/lib/neon/sku-catalog-queries';
import {
  enqueueCatalogLinkChoresForImport,
  type EnqueueCatalogLinkChoreInput,
} from '@/lib/inventory/order-catalog-link-chores';
import {
  resolveListingIdentity,
  shouldEnqueueCatalogLinkChore,
} from '@/lib/inventory/order-catalog-link-chore-gates';
import type { SyncProgress, TransferOrderDetail } from '@/lib/orders-sync/types';
import {
  groupCanonicalOrderLines,
  type CanonicalOrderLine,
} from '@/lib/orders/canonical-order';
import {
  buyerIdentityKey,
  resolveBuyerCustomers,
} from '@/lib/orders/resolve-buyer-customers';
import { normalizeItemNumber } from '@/lib/automations/listing-match';
import {
  crossSourceBackfillPolicy,
  orderCollapseCandidates,
  matchAggregatorOrderRows,
  matchMarketplaceOrderRows,
  placeholderRowsToRekey,
  shouldRekeyToIncomingSource,
  type PlatformOf,
} from '@/lib/orders/order-source-match';
import { filledOrderColumns, isBlank, planOrderRowBackfill } from '@/lib/orders/order-row-backfill';
import type { BackfillPolicy } from '@/lib/orders/order-row-backfill';

/** Whose customer id the buyer block carries: its own `channel` (an aggregator
 *  names itself), else the order's source. */
const buyerChannel = (order: CanonicalOrderLine) => order.buyer?.channel || order.accountSource;

/** Tracking resolution is fanned out in batches of this size. */
const TRACKING_RESOLVE_BATCH = 10;

/** SQL form of {@link normalizeItemNumber} — uppercase, trimmed, non-alphanumerics stripped. */
const normalizedSql = (column: string) =>
  `regexp_replace(UPPER(BTRIM(COALESCE(${column}, ''))), '[^A-Z0-9]', '', 'g')`;

const NORMALIZED_SKU_SQL = normalizedSql('sku');
const NORMALIZED_PLATFORM_SKU_SQL = normalizedSql('spi.platform_sku');
const NORMALIZED_PLATFORM_ITEM_SQL = normalizedSql('spi.platform_item_id');

type OrderProjection = {
  id: number;
  orderId: string | null;
  itemNumber: string | null;
  productTitle: string | null;
  quantity: string | null;
  sku: string | null;
  condition: string | null;
  notes: string | null;
  customerId: number | null;
  shipmentId: number | null;
  accountSource: string | null;
  status: string | null;
  skuCatalogId?: number | null;
  createdAt: Date | string | null;
  // Price rides the projection ONLY so first-write-wins can see it; the type
  // and toProjection below must both carry it or the guard reads undefined and
  // every re-sync rewrites the price (found live 2026-09-15).
  saleAmount?: string | null;
  currency?: string | null;
};

export interface IngestCanonicalOrdersResult {
  processedOrders: number;
  insertedOrders: number;
  /** DB ids of the rows actually inserted this call — empty when every canonical order matched an existing row. */
  insertedOrderIds: number[];
  updatedOrdersTracking: number;
  updatedOrdersFields: number;
  deletedDuplicateOrders: number;
  /** Aggregator orders left untouched because their number sits under more
   *  than one platform (or beside a legacy aggregator row) — the caller
   *  quarantines them. */
  ambiguousOrderIds: string[];
  /** Non-blank tracking values that failed carrier detection (not linked). */
  unresolvedTrackingCount: number;
  matchedCustomers: number;
  unmatchedCustomers: number;
  details: {
    /** Each carries its `orders.id` (from INSERT … RETURNING). */
    inserted: TransferOrderDetail[];
    /** One per backfilled row (an adopt of two rows = two), each with its
     *  `orders.id`, `outcome` and the columns it changed (`filledFields`). */
    updated: TransferOrderDetail[];
    deleted: TransferOrderDetail[];
    unknownTitle: TransferOrderDetail[];
    unresolvedTracking: TransferOrderDetail[];
    unmatchedCatalog: TransferOrderDetail[];
    /** One per `ambiguousOrderIds` entry. */
    ambiguous: TransferOrderDetail[];
  };
}

function emptyIngestResult(): IngestCanonicalOrdersResult {
  return {
    processedOrders: 0,
    insertedOrders: 0,
    insertedOrderIds: [],
    updatedOrdersTracking: 0,
    updatedOrdersFields: 0,
    deletedDuplicateOrders: 0,
    ambiguousOrderIds: [],
    unresolvedTrackingCount: 0,
    matchedCustomers: 0,
    unmatchedCustomers: 0,
    details: {
      inserted: [],
      updated: [],
      deleted: [],
      unknownTitle: [],
      unresolvedTracking: [],
      unmatchedCatalog: [],
      ambiguous: [],
    },
  };
}

function compactUpdateValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === undefined) return false;
      if (typeof value === 'number' && !Number.isFinite(value)) return false;
      return true;
    }),
  );
}

function pickLatestByKey<T extends { createdAt: Date | null }>(rows: T[], getKey: (row: T) => string) {
  const result = new Map<string, T>();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!key || result.has(key)) return;
    result.set(key, row);
  });
  return result;
}

/** Match key for a buyer name — trimmed, case- and whitespace-insensitive. */
function customerNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `customerNameKey` in SQL. */
function customerNameKeySql(expr: string): string {
  return `lower(btrim(regexp_replace(${expr}, '\\s+', ' ', 'g')))`;
}

/** Resolve name-only buyers to `customers` rows, match-then-create, in two queries total regardless of batch size. */
async function resolveCustomersByName(
  requests: Array<{ name: string; sourceOrderId: string }>,
  effectiveOrgId: OrgId,
  orgId?: OrgId,
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();

  // First sighting of each name wins the `order_id` stamp — later duplicates
  // are the same person, and one customer per name is the point.
  const wanted = new Map<string, { name: string; sourceOrderId: string }>();
  requests.forEach(({ name, sourceOrderId }) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    const key = customerNameKey(trimmed);
    if (!wanted.has(key)) wanted.set(key, { name: trimmed, sourceOrderId });
  });
  if (wanted.size === 0) return resolved;

  const keys = Array.from(wanted.keys());
  const runQuery = <T extends Record<string, unknown>>(sql: string, params: unknown[]) =>
    orgId ? tenantQuery<T>(orgId, sql, params) : pool.query<T>(sql, params);

  // Match on customer_name OR display_name — the same two columns
  // `findCustomerByName` reads, so a customer created by any other surface is
  // found here rather than duplicated.
  const nameKeyExpr = customerNameKeySql(
    "COALESCE(NULLIF(btrim(customer_name), ''), display_name, '')",
  );
  const existing = await runQuery<{ id: number; match_key: string }>(
    `SELECT id, ${nameKeyExpr} AS match_key
       FROM customers
      WHERE organization_id = $2
        AND ${nameKeyExpr} = ANY($1::text[])
      ORDER BY created_at ASC, id ASC`,
    [keys, effectiveOrgId],
  );
  // Oldest first, so the earliest row wins a name with duplicates already in
  // the book — new orders join the established customer, not a later copy.
  existing.rows.forEach((row) => {
    const key = String(row.match_key || '');
    if (key && !resolved.has(key)) resolved.set(key, Number(row.id));
  });

  const toCreate = keys.filter((key) => !resolved.has(key)).map((key) => wanted.get(key)!);
  if (toCreate.length === 0) return resolved;

  const values: unknown[] = [];
  const tuples = toCreate.map(({ name, sourceOrderId }, i) => {
    const parts = name.split(/\s+/);
    const base = i * 5;
    values.push(
      effectiveOrgId,
      name,
      parts[0] || '',
      parts.length > 1 ? parts.slice(1).join(' ') : '',
      sourceOrderId || null,
    );
    return `($${base + 1}, $${base + 2}, $${base + 2}, $${base + 3}, $${base + 4}, 'customer', $${base + 5}, now(), now())`;
  });

  const created = await runQuery<{ id: number; match_key: string }>(
    `INSERT INTO customers (
       organization_id, customer_name, display_name, first_name, last_name,
       contact_type, order_id, created_at, updated_at
     ) VALUES ${tuples.join(', ')}
     RETURNING id, ${customerNameKeySql('customer_name')} AS match_key`,
    values,
  );
  created.rows.forEach((row) => {
    const key = String(row.match_key || '');
    if (key) resolved.set(key, Number(row.id));
  });

  return resolved;
}

/**
 * The order's canonical deadline lives on its OPEN `work_assignments` TEST row.
 * Upsert rather than insert so a re-sync moves the deadline instead of creating
 * a second assignment.
 */
async function upsertOrderDeadline(orderId: number, deadlineAt: Date | null, orgId?: OrgId) {
  const selectSql = (scoped: boolean) => `
    SELECT id
      FROM work_assignments
     WHERE entity_type = 'ORDER'
       AND entity_id   = $1
       AND work_type   = 'TEST'
       AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
       ${scoped ? 'AND organization_id = $2' : ''}
     ORDER BY
       CASE status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'OPEN' THEN 3 END,
       id DESC
     LIMIT 1`;

  if (orgId) {
    await withTenantTransaction(orgId, async (client) => {
      const existing = await client.query(selectSql(true), [orderId, orgId]);
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE work_assignments SET deadline_at = $1, updated_at = NOW()
            WHERE id = $2 AND organization_id = $3`,
          [deadlineAt, existing.rows[0].id, orgId],
        );
        return;
      }
      await client.query(
        `INSERT INTO work_assignments
           (organization_id, entity_type, entity_id, work_type, assigned_tech_id, status, priority, deadline_at)
         VALUES ($1, 'ORDER', $2, 'TEST', NULL, 'OPEN', 100, $3)
         ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
        [orgId, orderId, deadlineAt],
      );
    });
    return;
  }

  const existing = await pool.query(selectSql(false), [orderId]);
  if (existing.rows.length > 0) {
    await pool.query(`UPDATE work_assignments SET deadline_at = $1, updated_at = NOW() WHERE id = $2`, [
      deadlineAt,
      existing.rows[0].id,
    ]);
    return;
  }
  await pool.query(
    `INSERT INTO work_assignments
       (organization_id, entity_type, entity_id, work_type, assigned_tech_id, status, priority, deadline_at)
     VALUES ($1, 'ORDER', $2, 'TEST', NULL, 'OPEN', 100, $3)
     ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
    [transitionalDogfoodOrgId(), orderId, deadlineAt],
  );
}

/**
 * Link every resolved shipment to the order via `shipment_links` (the sole
 * linkage SoT). The helper demotes the order's other primaries so exactly one
 * stays primary.
 */
async function upsertOrderShipmentLinks(
  orderRowId: number,
  shipmentIds: number[],
  primaryShipmentId: number | null,
  source: string,
  orgId?: OrgId,
) {
  const uniqueIds = Array.from(
    new Set(shipmentIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)),
  );
  if (uniqueIds.length === 0) return;

  const effectiveOrg = orgId ?? transitionalDogfoodOrgId();
  await withTenantTransaction(effectiveOrg, async (client) => {
    for (const sid of uniqueIds) {
      const isPrimary = primaryShipmentId != null && sid === primaryShipmentId;
      await linkShipment(
        effectiveOrg,
        {
          ownerType: 'ORDER',
          ownerId: orderRowId,
          shipmentId: sid,
          direction: 'OUTBOUND',
          isPrimary,
          role: isPrimary ? 'ORDER_PRIMARY' : 'ORDER_SPLIT',
          source,
        },
        client,
      );
    }
  });
}

interface IngestCanonicalOrdersOptions {
  /** Tenant scope. Omitted → legacy raw-pool path stamped with the dogfood org. */
  orgId?: OrgId;
  /** Provenance recorded on `shipment_links`. */
  source: string;
  progress?: SyncProgress;
  /** Which existing order an incoming one is considered to BE. */
  matchOn?: 'orderId' | 'accountSourceAndOrderId';
  /** Fields this source is AUTHORITATIVE for and may refresh on an order that already exists. */
  authoritative?: {
    /** Overwrite `product_title` when the source supplies a non-empty one. */
    productTitle?: boolean;
    /**
     * Apply `line.status` — but ONLY while the order is still untouched
     * (existing status null / '' / 'unassigned'). Once an operator has moved
     * the order through the pipeline, local progress always wins.
     */
    status?: boolean;
  };
  /** Maintain the canonical `work_assignments` TEST deadline row. */
  manageDeadlines?: boolean;
  /** Fold every row matching `matchOn` onto the richest one and DELETE the losers. */
  collapseDuplicates?: boolean;
  /** Title stored on INSERT when neither the source nor the catalog knows one (e.g. */
  fallbackProductTitle?: string;
  /** The lines come from an AGGREGATOR (ShipStation) that has already attributed each order to its platform account_source. */
  aggregator?: { platformOf: PlatformOf };
}

const noopProgress: SyncProgress = () => {};

/**
 * Upsert canonical orders into `orders` and everything that hangs off them.
 *
 * Accepts LINES and folds them itself, so a source may emit one line per item
 * without knowing that `orders` is currently one row per line.
 */
export async function ingestCanonicalOrders(
  lines: CanonicalOrderLine[],
  {
    orgId,
    source,
    progress = noopProgress,
    matchOn = 'orderId',
    authoritative = {},
    manageDeadlines = true,
    collapseDuplicates = true,
    fallbackProductTitle = '',
    aggregator,
  }: IngestCanonicalOrdersOptions,
): Promise<IngestCanonicalOrdersResult> {
  const effectiveOrgId: OrgId = orgId ?? transitionalDogfoodOrgId();
  const canonicalOrders = groupCanonicalOrderLines(lines);
  if (canonicalOrders.length === 0) return emptyIngestResult();

  // NUL as the joiner: `accountSource` is a free-text channel label that may
  // contain spaces, so a printable separator would let ("a b","c") and
  // ("a","b c") collide onto one key — merging two unrelated orders.
  const matchKey = (accountSource: string | null, orderId: string) =>
    matchOn === 'accountSourceAndOrderId'
      ? `${String(accountSource ?? '').trim()}\u0000${orderId}`
      : orderId;

  const sourceOrderIds = Array.from(new Set(canonicalOrders.map((o) => o.externalOrderId)));
  const sourceTrackings = Array.from(new Set(canonicalOrders.flatMap((o) => o.trackings)));
  const sourceTrackingNormalized = Array.from(
    new Set(sourceTrackings.map((t) => normalizeTrackingNumber(t)).filter(Boolean)),
  );

  // ─── Resolve tracking → shipment ids ──────────────────────────────── `shipping_tracking_numbers` has NO organization_id column…
  const shipmentTrackingById = new Map<number, string>();
  const shipmentByNormalized = new Map<string, { id: number; tracking: string }>();
  const shipmentIdCache = new Map<string, number | null>();

  const readShipmentRows = async (sql: string, params: unknown[]) =>
    orgId ? await tenantQuery(orgId, sql, params) : await pool.query(sql, params);

  const absorbShipmentRows = (rows: any[]) => {
    rows.forEach((row) => {
      const normalized = String(row.tracking_number_normalized || '').trim();
      const id = Number(row.id);
      if (!normalized || Number.isNaN(id)) return;
      const tracking = String(row.tracking_number_raw || '').trim();
      if (!shipmentByNormalized.has(normalized)) {
        shipmentByNormalized.set(normalized, { id, tracking });
        shipmentIdCache.set(normalized, id);
      }
      shipmentTrackingById.set(id, tracking);
    });
  };

  if (sourceTrackingNormalized.length > 0) {
    const existing = await readShipmentRows(
      `SELECT id, tracking_number_raw, tracking_number_normalized
         FROM shipping_tracking_numbers
        WHERE tracking_number_normalized = ANY($1::text[])`,
      [sourceTrackingNormalized],
    );
    absorbShipmentRows(existing.rows);
  }

  const ensureShipmentId = async (tracking: string) => {
    const normalized = normalizeTrackingNumber(tracking);
    if (!normalized) return null;
    if (shipmentIdCache.has(normalized)) return shipmentIdCache.get(normalized) ?? null;
    // PASS THE ORG.
    const resolved = await resolveShipmentId(tracking, effectiveOrgId);
    shipmentIdCache.set(normalized, resolved.shipmentId ?? null);
    return resolved.shipmentId ?? null;
  };

  progress({ type: 'phase', phase: 'resolving_tracking', count: sourceTrackings.length });
  for (let i = 0; i < sourceTrackings.length; i += TRACKING_RESOLVE_BATCH) {
    await Promise.all(sourceTrackings.slice(i, i + TRACKING_RESOLVE_BATCH).map(ensureShipmentId));
  }
  progress({ type: 'phase', phase: 'matching_orders' });

  const resolvedShipmentIds = Array.from(
    new Set(
      Array.from(shipmentIdCache.values()).filter(
        (id): id is number => typeof id === 'number' && Number.isFinite(id),
      ),
    ),
  );
  const missingShipmentIds = resolvedShipmentIds.filter((id) => !shipmentTrackingById.has(id));
  if (missingShipmentIds.length > 0) {
    const resolved = await readShipmentRows(
      `SELECT id, tracking_number_raw, tracking_number_normalized
         FROM shipping_tracking_numbers
        WHERE id = ANY($1::bigint[])`,
      [missingShipmentIds],
    );
    absorbShipmentRows(resolved.rows);
  }

  // ─── Existing orders + customers for these ids ──────────────────────
  const orderProjectionCols = {
    orderId: ordersTable.orderId,
    id: ordersTable.id,
    itemNumber: ordersTable.itemNumber,
    productTitle: ordersTable.productTitle,
    quantity: ordersTable.quantity,
    sku: ordersTable.sku,
    condition: ordersTable.condition,
    notes: ordersTable.notes,
    customerId: ordersTable.customerId,
    shipmentId: ordersTable.shipmentId,
    accountSource: ordersTable.accountSource,
    status: ordersTable.status,
    skuCatalogId: ordersTable.skuCatalogId,
    createdAt: ordersTable.createdAt,
    // Present ONLY so the update builder can apply first-write-wins to the
    // price (operator ruling 2026-09-15): without reading the current value
    // back, a source that carries a price would rewrite it on every sync.
    saleAmount: ordersTable.saleAmount,
    currency: ordersTable.currency,
  } as const;

  const existingOrders = orgId
    ? await withTenantDrizzle(orgId, (tx) =>
        tx
          .select(orderProjectionCols)
          .from(ordersTable)
          .where(and(inArray(ordersTable.orderId, sourceOrderIds), eq(ordersTable.organizationId, orgId)))
          .orderBy(desc(ordersTable.createdAt)),
      )
    : await db
        .select(orderProjectionCols)
        .from(ordersTable)
        .where(inArray(ordersTable.orderId, sourceOrderIds))
        .orderBy(desc(ordersTable.createdAt));

  const customerProjectionCols = {
    id: customersTable.id,
    orderId: customersTable.orderId,
    createdAt: customersTable.createdAt,
  } as const;

  const sourceCustomers = orgId
    ? await withTenantDrizzle(orgId, (tx) =>
        tx
          .select(customerProjectionCols)
          .from(customersTable)
          .where(
            and(inArray(customersTable.orderId, sourceOrderIds), eq(customersTable.organizationId, orgId)),
          )
          .orderBy(desc(customersTable.createdAt)),
      )
    : await db
        .select(customerProjectionCols)
        .from(customersTable)
        .where(inArray(customersTable.orderId, sourceOrderIds))
        .orderBy(desc(customersTable.createdAt));

  const toProjection = (order: (typeof existingOrders)[number]): OrderProjection => ({
    id: Number(order.id),
    orderId: order.orderId,
    itemNumber: order.itemNumber,
    productTitle: order.productTitle,
    quantity: order.quantity,
    sku: order.sku,
    condition: order.condition,
    notes: order.notes,
    customerId: order.customerId,
    shipmentId: order.shipmentId ?? null,
    accountSource: order.accountSource ?? null,
    status: order.status ?? null,
    skuCatalogId: order.skuCatalogId ?? null,
    createdAt: order.createdAt ?? null,
    // NUMERIC arrives as a string; normalise so the first-write-wins guard
    // never sees a Decimal object it would stringify wrongly.
    saleAmount: order.saleAmount == null ? null : String(order.saleAmount),
    currency: order.currency ?? null,
  });

  // Rows arrive newest-first, so the first sighting of an order id is latest.
  const latestOrderByKey = new Map<string, OrderProjection>();
  const allOrdersByKey = new Map<string, OrderProjection[]>();
  // Every row per order id, whatever its source — the cross-source fallback
  // (`order-source-match.ts`) when a per-source key finds nothing.
  const allOrdersByOrderId = new Map<string, OrderProjection[]>();
  existingOrders.forEach((order) => {
    const orderId = String(order.orderId || '').trim();
    if (!orderId || Number.isNaN(Number(order.id))) return;
    const key = matchKey(order.accountSource, orderId);
    const projection = toProjection(order);
    if (!latestOrderByKey.has(key)) latestOrderByKey.set(key, projection);
    const rows = allOrdersByKey.get(key) ?? [];
    rows.push(projection);
    allOrdersByKey.set(key, rows);
    const byId = allOrdersByOrderId.get(orderId) ?? [];
    byId.push(projection);
    allOrdersByOrderId.set(orderId, byId);
  });

  const latestCustomerByOrderId = pickLatestByKey(sourceCustomers, (customer) =>
    String(customer.orderId || '').trim(),
  );

  // ─── Resolve buyers with real identity ────────────────────────────── The strong tier ABOVE the name resolution below:
  const customerIdByBuyer = await resolveBuyerCustomers(
    {
      orgId: effectiveOrgId,
      buyers: canonicalOrders
        .filter((order) => order.buyer && buyerIdentityKey(buyerChannel(order), order.buyer))
        .map((order) => ({ accountSource: buyerChannel(order), buyer: order.buyer!, placedAt: order.orderDate })),
    },
    {
      runQuery: (org, sql, params) =>
        orgId ? tenantQuery(org, sql, params) : pool.query(sql, params),
    },
  );

  // ─── Resolve name-only buyers to real customers ───────────────────── A source that carries a buyer NAME but no id/email/phone (a mapped…
  const customerIdByName = await resolveCustomersByName(
    canonicalOrders
      .filter(
        (order) =>
          !order.buyer &&
          !latestCustomerByOrderId.get(String(order.externalOrderId || '').trim()),
      )
      .map((order) => ({
        name: order.customerName,
        sourceOrderId: String(order.externalOrderId || '').trim(),
      })),
    effectiveOrgId,
    orgId,
  );

  // ─── Hydrate catalog identity ───────────────────────────────────────
  const titleBySku = new Map<string, string>();
  const catalogByLookupKey = new Map<string, SkuCatalogTitleMatch>();
  const catalogByTitle = new Map<string, SkuCatalogTitleMatch>();
  {
    const lookupSkus = new Set<string>();
    const lookupItemNumbers = new Set<string>();
    const titlesNeedingCatalog = new Set<string>();
    canonicalOrders.forEach((order) => {
      if (order.sku) lookupSkus.add(normalizeItemNumber(order.sku));
      if (order.itemNumber) lookupItemNumbers.add(normalizeItemNumber(order.itemNumber));
      if (order.productTitle && !order.sku && !order.itemNumber) {
        titlesNeedingCatalog.add(order.productTitle);
      }
    });
    lookupSkus.delete('');
    lookupItemNumbers.delete('');

    if (lookupSkus.size > 0) {
      const sql = `SELECT id, sku, product_title
                     FROM sku_catalog
                    WHERE ${NORMALIZED_SKU_SQL} = ANY($1::text[])`;
      const result = orgId
        ? await tenantQuery(orgId, `${sql} AND organization_id = $2`, [
            Array.from(lookupSkus),
            orgId,
          ])
        : await pool.query(sql, [Array.from(lookupSkus)]);
      for (const row of result.rows) {
        const sku = String(row.sku || '').trim();
        const title = String(row.product_title || '').trim();
        const id = Number(row.id);
        if (!sku || !Number.isFinite(id)) continue;
        const key = normalizeItemNumber(sku);
        if (title) titleBySku.set(key, title);
        if (!catalogByLookupKey.has(key)) {
          catalogByLookupKey.set(key, { id, sku, productTitle: title });
        }
      }
    }

    if (lookupItemNumbers.size > 0) {
      const sql = `SELECT spi.platform_sku, spi.platform_item_id, sc.id, sc.product_title, sc.sku
                     FROM sku_platform_ids spi
                     JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id
                    WHERE (${NORMALIZED_PLATFORM_SKU_SQL} = ANY($1::text[])
                        OR ${NORMALIZED_PLATFORM_ITEM_SQL} = ANY($1::text[]))`;
      const result = orgId
        ? await tenantQuery(
            orgId,
            `${sql} AND sc.organization_id = spi.organization_id AND spi.organization_id = $2`,
            [Array.from(lookupItemNumbers), orgId],
          )
        : await pool.query(sql, [Array.from(lookupItemNumbers)]);
      for (const row of result.rows) {
        const title = String(row.product_title || '').trim();
        const id = Number(row.id);
        const sku = String(row.sku || '').trim();
        if (!Number.isFinite(id) || !sku) continue;
        const match: SkuCatalogTitleMatch = { id, sku, productTitle: title };
        // First insert wins, per key — the pre-existing tie-break for a
        // platform id that two catalog rows both claim.
        for (const raw of [row.platform_sku, row.platform_item_id]) {
          const key = normalizeItemNumber(typeof raw === 'string' ? raw : '');
          if (!key) continue;
          if (title && !titleBySku.has(key)) titleBySku.set(key, title);
          if (!catalogByLookupKey.has(key)) catalogByLookupKey.set(key, match);
        }
      }
    }

    if (titlesNeedingCatalog.size > 0) {
      const byTitle = await batchResolveSkuCatalogByTitles(Array.from(titlesNeedingCatalog), orgId);
      byTitle.forEach((match, title) => catalogByTitle.set(title, match));
    }
  }

  const platformItemIdByCatalogId = await batchPlatformItemIdsByCatalogIds(
    Array.from(
      new Set([
        ...Array.from(catalogByLookupKey.values()).map((m) => m.id),
        ...Array.from(catalogByTitle.values()).map((m) => m.id),
      ]),
    ),
    orgId,
  );

  // `titleBySku` and `catalogByLookupKey` are keyed on the NORMALIZED form, so
  // every read normalizes too. A raw-string read here would make the whole
  // normalized lookup above dead weight.
  const resolveProductTitle = (
    sourceTitle: string,
    sku: string,
    itemNumber: string,
  ): { title: string; source: TransferOrderDetail['titleSource'] } => {
    if (sourceTitle) return { title: sourceTitle, source: 'sheet' };
    const bySku = titleBySku.get(normalizeItemNumber(sku));
    if (bySku) return { title: bySku, source: 'sku_catalog' };
    const byItem = titleBySku.get(normalizeItemNumber(itemNumber));
    if (byItem) return { title: byItem, source: 'platform_lookup' };
    return { title: '', source: 'none' };
  };

  const resolveCatalogLink = (sourceTitle: string, sku: string, itemNumber: string) => {
    let resolvedSku = sku;
    let resolvedItemNumber = itemNumber;
    let skuCatalogId: number | null = null;
    let titleSource: TransferOrderDetail['titleSource'] = 'sheet';
    let productTitle = sourceTitle;

    const bySku = catalogByLookupKey.get(normalizeItemNumber(resolvedSku)) ?? null;
    const byItem = bySku
      ? null
      : catalogByLookupKey.get(normalizeItemNumber(resolvedItemNumber)) ?? null;
    const byTitle = !bySku && !byItem && productTitle ? catalogByTitle.get(productTitle) ?? null : null;
    const match = bySku ?? byItem ?? byTitle;

    if (match) {
      resolvedSku = resolvedSku || match.sku;
      skuCatalogId = match.id;
      if (!productTitle) {
        productTitle = match.productTitle;
        titleSource = byTitle ? 'title_catalog_match' : byItem ? 'platform_lookup' : 'sku_catalog';
      } else if (byTitle) {
        titleSource = 'title_catalog_match';
      }
    } else {
      const resolved = resolveProductTitle(sourceTitle, resolvedSku, resolvedItemNumber);
      productTitle = resolved.title;
      titleSource = resolved.source;
    }

    if (!resolvedItemNumber && skuCatalogId) {
      resolvedItemNumber = platformItemIdByCatalogId.get(skuCatalogId) ?? '';
    }

    // A source that names the product only by SKU (CSV import, ShipStation)
    // still needs SOME listing identity on the row, or the catalog-link queue
    // can neither ask about it nor heal it later. See `resolveListingIdentity`.
    resolvedItemNumber = resolveListingIdentity({
      itemNumber: resolvedItemNumber,
      sku: resolvedSku,
      skuCatalogId,
    });

    return { sku: resolvedSku, itemNumber: resolvedItemNumber, skuCatalogId, titleSource, productTitle };
  };

  // ─── Plan the writes ────────────────────────────────────────────────
  const ordersToInsert: Array<{
    values: Record<string, unknown>;
    shipByDate: Date | null;
    shipmentIds: number[];
    detail: TransferOrderDetail;
  }> = [];
  const ordersToBackfill: Array<{ id: number; values: Record<string, unknown>; detail: TransferOrderDetail }> = [];
  const ordersToDelete: Array<{ id: number; detail: TransferOrderDetail }> = [];
  const shipmentLinksToUpsert = new Map<number, { primaryShipmentId: number | null; shipmentIds: number[] }>();
  const orderDeadlinesToUpsert: Array<{ id: number; shipByDate: Date | null }> = [];
  const catalogLinkChoresToEnqueue: EnqueueCatalogLinkChoreInput[] = [];
  const detailsUnknownTitle: TransferOrderDetail[] = [];
  const detailsUnresolvedTracking: TransferOrderDetail[] = [];
  const detailsUnmatchedCatalog: TransferOrderDetail[] = [];
  let updatedOrdersTracking = 0;
  let matchedCustomers = 0;
  let unmatchedCustomers = 0;
  const ambiguousOrderIds: string[] = [];
  const detailsAmbiguous: TransferOrderDetail[] = [];

  for (const order of canonicalOrders) {
    const orderId = order.externalOrderId;
    const catalogLink = resolveCatalogLink(order.productTitle, order.sku, order.itemNumber);
    const existingOrder = latestOrderByKey.get(matchKey(order.accountSource, orderId));
    // Per-source keying found nothing: an aggregator (ShipStation) may ADOPT
    // the platform's rows, and either kind of source may CLAIM a legacy
    // aggregator row.
    const rowsForNumber = allOrdersByOrderId.get(orderId) ?? [];
    const crossSource =
      existingOrder || matchOn !== 'accountSourceAndOrderId'
        ? null
        : aggregator
          ? matchAggregatorOrderRows(order.accountSource, rowsForNumber, aggregator.platformOf)
          : matchMarketplaceOrderRows(order.accountSource, rowsForNumber);
    if (crossSource?.kind === 'ambiguous') {
      ambiguousOrderIds.push(orderId);
      detailsAmbiguous.push({
        orderId,
        productTitle: catalogLink.productTitle,
        sku: catalogLink.sku,
        itemNumber: catalogLink.itemNumber,
        tracking: order.trackings[0] || '',
        titleSource: catalogLink.titleSource,
        accountSource: order.accountSource || null,
        skuCatalogId: catalogLink.skuCatalogId,
        orderRowId: null,
        outcome: 'ambiguous',
        quarantineReason: 'ambiguous_match',
        filledFields: [],
      });
      continue;
    }
    const existingForDetail = existingOrder ?? crossSource?.rows[0];

    const detailRow: TransferOrderDetail = {
      orderId,
      productTitle: catalogLink.productTitle,
      sku: catalogLink.sku,
      itemNumber: catalogLink.itemNumber,
      tracking: order.trackings[0] || '',
      titleSource: catalogLink.titleSource,
      accountSource: order.accountSource || null,
      skuCatalogId: catalogLink.skuCatalogId,
      existingAccountSource: existingForDetail?.accountSource ?? null,
      existingCreatedAt:
        existingForDetail?.createdAt instanceof Date
          ? existingForDetail.createdAt.toISOString()
          : typeof existingForDetail?.createdAt === 'string'
            ? existingForDetail.createdAt
            : null,
    };

    if (catalogLink.titleSource === 'none') detailsUnknownTitle.push(detailRow);
    // Gate on the RESOLVED identity, not the raw one: the raw value is blank on
    // every lane but Sheets, and the chore + the `orders.item_number` the
    // cascade matches must be the same string or a link heals nothing.
    if (shouldEnqueueCatalogLinkChore({
      rawItemNumber: catalogLink.itemNumber,
      skuCatalogId: catalogLink.skuCatalogId,
    })) {
      detailsUnmatchedCatalog.push(detailRow);
      catalogLinkChoresToEnqueue.push({
        itemNumber: catalogLink.itemNumber,
        accountSource: order.accountSource,
        productTitle: catalogLink.productTitle,
        sku: catalogLink.sku,
        bumpBy: 1,
      });
    }

    const matchedCustomer = latestCustomerByOrderId.get(orderId);
    const matchedCustomerId = matchedCustomer ? Number(matchedCustomer.id) : Number.NaN;
    // Identity precedence:
    const buyerKey = order.buyer ? buyerIdentityKey(buyerChannel(order), order.buyer) : null;
    const customerId =
      (Number.isFinite(matchedCustomerId) ? matchedCustomerId : null) ??
      (buyerKey ? (customerIdByBuyer.get(buyerKey) ?? null) : null) ??
      customerIdByName.get(customerNameKey(order.customerName || '')) ??
      null;
    if (customerId) matchedCustomers++;
    else unmatchedCustomers++;

    const shipmentIds = new Set<number>();
    const unresolvedTrackings: string[] = [];
    for (const rawTracking of order.trackings) {
      const normalized = normalizeTrackingNumber(rawTracking);
      const cached = normalized
        ? shipmentIdCache.get(normalized) ?? shipmentByNormalized.get(normalized)?.id ?? null
        : null;
      const shipmentId = cached ?? (await ensureShipmentId(rawTracking));
      if (shipmentId && Number.isFinite(shipmentId)) shipmentIds.add(Number(shipmentId));
      else unresolvedTrackings.push(rawTracking);
    }
    // A non-blank tracking that resolved to no shipment failed carrier
    // detection (e.g. a double-scanned / malformed value). Surface it rather
    // than letting it vanish behind an "Up to date" summary.
    if (unresolvedTrackings.length > 0) {
      const unresolvedDetail: TransferOrderDetail = { ...detailRow, tracking: unresolvedTrackings.join(', ') };
      detailsUnresolvedTracking.push(unresolvedDetail);
      progress({ type: 'detail', kind: 'unresolvedTracking', row: unresolvedDetail });
    }

    /** Plan one existing row's additive backfill (+ its links / deadline). */
    const planBackfill = (
      row: OrderProjection,
      policy: Pick<BackfillPolicy, 'titleAuthoritative' | 'sourceWrite'>,
      outcome: 'backfilled' | 'adopted' | 'claimed',
    ) => {
      // Read at call time: the collapse branch adds losers' ids before calling.
      const shipmentIdList = Array.from(shipmentIds.values());
      const plan = planOrderRowBackfill(
        row,
        {
          orderId,
          itemNumber: catalogLink.itemNumber,
          productTitle: catalogLink.productTitle,
          sku: catalogLink.sku,
          skuCatalogId: catalogLink.skuCatalogId,
          quantity: order.quantity,
          condition: order.condition,
          notes: order.notes,
          status: order.status,
          saleAmount: order.saleAmount,
          currency: order.currency,
          accountSource: order.accountSource,
          customerId,
          shipmentIds: shipmentIdList,
        },
        { ...policy, statusAuthoritative: !!authoritative.status },
      );
      if (plan.filledShipment) updatedOrdersTracking++;
      const compacted = compactUpdateValues(plan.values);
      if (Object.keys(compacted).length > 0) {
        ordersToBackfill.push({
          id: row.id,
          values: compacted,
          detail: {
            ...detailRow,
            orderRowId: row.id,
            outcome,
            filledFields: filledOrderColumns(row, compacted),
            shipmentId: plan.primaryShipmentId,
          },
        });
      }
      if (shipmentIdList.length > 0) {
        shipmentLinksToUpsert.set(row.id, { primaryShipmentId: plan.primaryShipmentId, shipmentIds: shipmentIdList });
      }
      if (manageDeadlines) orderDeadlinesToUpsert.push({ id: row.id, shipByDate: order.shipByDate });
    };

    if (existingOrder) {
      // Collapse duplicates: keep the row carrying the most populated fields,
      // inherit the losers' shipment ids, delete the rest.
      const candidateList = allOrdersByKey.get(matchKey(order.accountSource, orderId)) ?? [existingOrder];
      const score = (o: OrderProjection) =>
        [o.productTitle, o.condition, o.itemNumber, o.sku, o.quantity, o.notes].filter((v) => !isBlank(v)).length;
      let orderToKeep: OrderProjection;
      if (candidateList.length > 1) {
        // Keeper first: a marketplace row always outranks the aggregator's
        // (ShipStation) copy, so a collapse can only ever delete the copy.
        const sorted = orderCollapseCandidates(candidateList, score);
        orderToKeep = sorted[0];
        // Without collapse the losers keep existing, so they keep their own
        // shipment links — inheriting them here would move a live row's
        // tracking onto a sibling that still points at it.
        if (collapseDuplicates) {
          sorted.slice(1).forEach((o) => {
            if (o.shipmentId != null) shipmentIds.add(Number(o.shipmentId));
            ordersToDelete.push({ id: o.id, detail: detailRow });
          });
        }
      } else {
        orderToKeep = candidateList[0];
      }

      // A marketplace updating the aggregator's row re-keys it to itself
      // (order-id matching lanes: Sheets, Ecwid, CSV) — unless a surviving
      // sibling already carries that source, which would collide on the key.
      const incomingSource = String(order.accountSource ?? '').trim();
      const survivors = collapseDuplicates ? [] : candidateList.filter((o) => o.id !== orderToKeep.id);
      const rekey =
        shouldRekeyToIncomingSource(orderToKeep.accountSource, order.accountSource) &&
        !survivors.some((o) => String(o.accountSource ?? '').trim() === incomingSource);
      planBackfill(
        orderToKeep,
        { titleAuthoritative: !!authoritative.productTitle, sourceWrite: rekey ? 'rekey' : 'fill' },
        'backfilled',
      );
    } else if (crossSource && (crossSource.kind === 'adopt' || crossSource.kind === 'claim')) {
      // Adopt (aggregator → marketplace rows) or claim (marketplace → the
      // aggregator's row). Every matched row is backfilled; none is deleted.
      // An adopted row under the bare platform takes the linked account.
      const policy = crossSourceBackfillPolicy(crossSource.kind, !!authoritative.productTitle);
      const rekey =
        crossSource.kind === 'adopt' && aggregator
          ? placeholderRowsToRekey(order.accountSource, crossSource.rows, aggregator.platformOf)
          : new Set<OrderProjection>();
      const outcome = crossSource.kind === 'adopt' ? 'adopted' : 'claimed';
      for (const row of crossSource.rows) {
        planBackfill(row, rekey.has(row) ? { ...policy, sourceWrite: 'rekey' } : policy, outcome);
      }
    } else {
      const shipmentIdList = Array.from(shipmentIds.values());
      ordersToInsert.push({
        shipByDate: order.shipByDate,
        shipmentIds: shipmentIdList,
        detail: {
          ...detailRow,
          orderRowId: null,
          outcome: 'inserted',
          filledFields: [],
          shipmentId: shipmentIdList[0] ?? null,
        },
        values: {
          // Explicit stamp: Drizzle's neon-http client can't carry the GUC, so
          // orders.organization_id (NOT NULL) must be set here.
          organizationId: effectiveOrgId,
          orderId,
          itemNumber: catalogLink.itemNumber || '',
          productTitle: catalogLink.productTitle || fallbackProductTitle || '',
          quantity: order.quantity || '1',
          sku: catalogLink.sku || '',
          condition: order.condition || '',
          shipmentId: shipmentIdList[0] ?? null,
          notes: order.notes || '',
          status: order.status || 'unassigned',
          statusHistory: [],
          customerId,
          accountSource: order.accountSource || '',
          saleAmount: order.saleAmount,
          currency: order.currency ?? 'USD',
          orderDate: order.orderDate,
        },
      });
    }
  }

  // ─── Execute ────────────────────────────────────────────────────────
  if (ordersToDelete.length > 0) {
    progress({ type: 'phase', phase: 'updating', count: ordersToDelete.length });
    const deleteIds = ordersToDelete.map((e) => e.id);
    if (orgId) {
      await withTenantDrizzle(orgId, (tx) =>
        tx.delete(ordersTable).where(and(inArray(ordersTable.id, deleteIds), eq(ordersTable.organizationId, orgId))),
      );
    } else {
      await db.delete(ordersTable).where(inArray(ordersTable.id, deleteIds));
    }
    for (const entry of ordersToDelete) progress({ type: 'detail', kind: 'deleted', row: entry.detail });
  }

  if (ordersToBackfill.length > 0) {
    progress({ type: 'phase', phase: 'updating', count: ordersToBackfill.length });
    // Each UPDATE is additionally scoped by organization_id so it can never
    // touch another tenant's row even if an id collision were possible.
    if (orgId) {
      await withTenantDrizzle(orgId, (tx) =>
        Promise.all(
          ordersToBackfill.map((entry) => {
            const compacted = compactUpdateValues(entry.values);
            if (Object.keys(compacted).length === 0) return Promise.resolve();
            return tx
              .update(ordersTable)
              .set(compacted)
              .where(and(eq(ordersTable.id, entry.id), eq(ordersTable.organizationId, orgId)));
          }),
        ),
      );
    } else {
      await Promise.all(
        ordersToBackfill.map((entry) => {
          const compacted = compactUpdateValues(entry.values);
          if (Object.keys(compacted).length === 0) return Promise.resolve();
          return db.update(ordersTable).set(compacted).where(eq(ordersTable.id, entry.id));
        }),
      );
    }
    for (const entry of ordersToBackfill) progress({ type: 'detail', kind: 'updated', row: entry.detail });
  }

  let insertedOrderIds: number[] = [];
  if (ordersToInsert.length > 0) {
    progress({ type: 'phase', phase: 'inserting', count: ordersToInsert.length });
    const insertValues = ordersToInsert.map((entry) => entry.values);
    const insertedOrders = orgId
      ? await withTenantDrizzle(orgId, (tx) =>
          tx.insert(ordersTable).values(insertValues).returning({ id: ordersTable.id }),
        )
      : await db.insert(ordersTable).values(insertValues).returning({ id: ordersTable.id });
    insertedOrderIds = insertedOrders.map((o) => o.id);
    insertedOrders.forEach((inserted, index) => {
      const planned = ordersToInsert[index];
      if (planned) planned.detail.orderRowId = Number(inserted.id);
      if (manageDeadlines && planned?.shipByDate) {
        orderDeadlinesToUpsert.push({ id: inserted.id, shipByDate: planned.shipByDate });
      }
      if ((planned?.shipmentIds.length ?? 0) > 0) {
        shipmentLinksToUpsert.set(inserted.id, {
          primaryShipmentId: Number(planned!.values.shipmentId ?? 0) || null,
          shipmentIds: planned!.shipmentIds,
        });
      }
    });
    for (const entry of ordersToInsert) progress({ type: 'detail', kind: 'inserted', row: entry.detail });
  }

  if (shipmentLinksToUpsert.size > 0) {
    await Promise.all(
      Array.from(shipmentLinksToUpsert.entries()).map(([orderRowId, link]) =>
        upsertOrderShipmentLinks(orderRowId, link.shipmentIds, link.primaryShipmentId, source, orgId),
      ),
    );
  }

  if (orderDeadlinesToUpsert.length > 0) {
    await Promise.all(orderDeadlinesToUpsert.map((e) => upsertOrderDeadline(e.id, e.shipByDate, orgId)));
  }

  // Auto-cage — the accepted/exception SPLIT (R-FLOW-2, 2026-08-31).
  if (insertedOrderIds.length > 0) {
    try {
      const { autoCageNewOrders } = await import('./auto-cage');
      const caged = await autoCageNewOrders(effectiveOrgId, insertedOrderIds);
      if (caged.length > 0) {
        console.info(`[ingestCanonicalOrders] auto-caged ${caged.length}/${insertedOrderIds.length} new orders for triage`);
      }
    } catch (err) {
      console.error('[ingestCanonicalOrders] auto-cage failed — new orders landed UNCAGED:', err);
    }
  }

  // Listing → staff automations (TEST assign on import / first item_number).
  // Best-effort: a rules/table miss must never fail ingest.
  if (orgId) {
    try {
      const { applyListingAssignment } = await import('@/lib/automations/apply-listing-assignment');
      const automationTargets: Array<{
        orderId: number;
        triggerKey: 'order.imported' | 'order.item_number_set';
        itemNumber: string | null;
        skuCatalogId: number | null;
        sku: string | null;
        accountSource: string | null;
      }> = [];

      for (let i = 0; i < ordersToInsert.length; i++) {
        const planned = ordersToInsert[i];
        const id = insertedOrderIds[i];
        if (!id || !planned) continue;
        automationTargets.push({
          orderId: id,
          triggerKey: 'order.imported',
          itemNumber: String(planned.values.itemNumber || '') || null,
          skuCatalogId:
            planned.values.skuCatalogId == null ? null : Number(planned.values.skuCatalogId),
          sku: String(planned.values.sku || '') || null,
          accountSource: String(planned.values.accountSource || '') || null,
        });
      }

      for (const entry of ordersToBackfill) {
        if (!('itemNumber' in entry.values)) continue;
        const itemNumber = String(entry.values.itemNumber || '') || null;
        if (!itemNumber) continue;
        automationTargets.push({
          orderId: entry.id,
          triggerKey: 'order.item_number_set',
          itemNumber,
          skuCatalogId:
            entry.values.skuCatalogId == null
              ? null
              : Number(entry.values.skuCatalogId as number),
          sku: entry.values.sku == null ? null : String(entry.values.sku),
          accountSource: null,
        });
      }

      await Promise.all(
        automationTargets.map((t) =>
          applyListingAssignment({
            organizationId: orgId,
            orderId: t.orderId,
            triggerKey: t.triggerKey,
            facts: {
              item_number: t.itemNumber,
              sku_catalog_id: t.skuCatalogId,
              sku: t.sku,
              account_source: t.accountSource,
            },
          }).catch((err) => {
            console.warn('[ingestCanonicalOrders] listing automation skipped:', err);
          }),
        ),
      );
    } catch (err) {
      console.warn('[ingestCanonicalOrders] listing automation unavailable:', err);
    }
  }

  // Explicit catalog-link chores for NEW unmatched item numbers only (no
  // historical orphan scan). Upserts unpaired sku_platform_ids + Review queue.
  if (catalogLinkChoresToEnqueue.length > 0) {
    await enqueueCatalogLinkChoresForImport(effectiveOrgId, catalogLinkChoresToEnqueue);
    for (const detail of detailsUnmatchedCatalog) {
      progress({ type: 'detail', kind: 'unmatchedCatalog', row: detail });
    }
  }

  // Bust the server-side cache BEFORE signalling clients to refetch, otherwise
  // a client's GET /api/orders races ahead and gets a stale cache hit.
  const processedIds = Array.from(
    new Set(
      [
        ...insertedOrderIds,
        ...ordersToBackfill.map((e) => e.id),
        ...ordersToDelete.map((e) => e.id),
        ...Array.from(latestOrderByKey.values()).map((o) => o.id),
      ].filter((id) => Number.isFinite(id) && id > 0),
    ),
  );

  await invalidateAllOrdersApiCaches([], effectiveOrgId);
  progress({ type: 'phase', phase: 'publishing' });
  if (processedIds.length > 0) {
    await publishOrderChanged({ organizationId: effectiveOrgId, orderIds: processedIds, source });
  }
  for (const detail of detailsUnknownTitle) progress({ type: 'detail', kind: 'unknownTitle', row: detail });

  return {
    processedOrders: canonicalOrders.length,
    insertedOrders: ordersToInsert.length,
    insertedOrderIds,
    updatedOrdersTracking,
    updatedOrdersFields: ordersToBackfill.length,
    deletedDuplicateOrders: ordersToDelete.length,
    ambiguousOrderIds,
    unresolvedTrackingCount: detailsUnresolvedTracking.length,
    matchedCustomers,
    unmatchedCustomers,
    details: {
      inserted: ordersToInsert.map((e) => e.detail),
      updated: ordersToBackfill.map((e) => e.detail),
      deleted: ordersToDelete.map((e) => e.detail),
      unknownTitle: detailsUnknownTitle,
      unresolvedTracking: detailsUnresolvedTracking,
      unmatchedCatalog: detailsUnmatchedCatalog,
      ambiguous: detailsAmbiguous,
    },
  };
}
