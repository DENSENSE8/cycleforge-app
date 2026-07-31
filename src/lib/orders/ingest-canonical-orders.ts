/**
 * `ingestCanonicalOrders` — the ONE domain writer for order ingest.
 *
 * Every source (Google Sheets, Ecwid, and — as they migrate — ShipStation,
 * Shopify, Square, eBay, Amazon) normalizes to `CanonicalOrderLine[]` at its
 * own edge and hands them here. This module owns everything that requires the
 * tenant's own data and therefore cannot live in a source adapter:
 *
 *   • tracking → shipment resolution + `shipment_links` (the linkage SoT)
 *   • catalog identity (sku / platform item id / title → `sku_catalog_id`)
 *     and the catalog-link chores for unmatched item numbers
 *   • customer matching
 *   • duplicate-order collapse (keep the richest row, delete the rest)
 *   • the canonical `work_assignments` deadline row
 *   • cache invalidation + the realtime `order_changed` publish
 *
 * Extracted verbatim-in-behavior from `jobs/google-sheets-transfer-orders.ts`,
 * which had grown into this pipeline plus a Sheets reader. Splitting them is
 * what lets a second source reuse the pipeline instead of copying an
 * `INSERT INTO orders` — there were nine such copies when this was written.
 *
 * Tenancy: when `orgId` is supplied every tenant-table read/write goes through
 * the GUC-carrying helpers (`tenantQuery` / `withTenantDrizzle`) and is scoped
 * by org. When omitted the legacy raw-pool path runs and writes are stamped
 * with `transitionalDogfoodOrgId()` — byte-identical to the prior behavior.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import pool from '@/lib/db';
import { db } from '@/lib/drizzle/db';
import { customers as customersTable, orders as ordersTable } from '@/lib/drizzle/schema';
import { withTenantDrizzle } from '@/lib/drizzle/tenant-db';
import { transitionalDogfoodOrgId, tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
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
import { shouldEnqueueCatalogLinkChore } from '@/lib/inventory/order-catalog-link-chore-gates';
import type { SyncProgress, TransferOrderDetail } from '@/lib/orders-sync/types';
import { groupCanonicalOrderLines, type CanonicalOrderLine } from '@/lib/orders/canonical-order';

/** Tracking resolution is fanned out in batches of this size. */
const TRACKING_RESOLVE_BATCH = 10;

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
  createdAt?: Date | null;
};

interface IngestCanonicalOrdersResult {
  processedOrders: number;
  insertedOrders: number;
  /** DB ids of the rows actually inserted this call — empty when every canonical order matched an existing row. */
  insertedOrderIds: number[];
  updatedOrdersTracking: number;
  updatedOrdersFields: number;
  deletedDuplicateOrders: number;
  /** Non-blank tracking values that failed carrier detection (not linked). */
  unresolvedTrackingCount: number;
  matchedCustomers: number;
  unmatchedCustomers: number;
  details: {
    inserted: TransferOrderDetail[];
    updated: TransferOrderDetail[];
    deleted: TransferOrderDetail[];
    unknownTitle: TransferOrderDetail[];
    unresolvedTracking: TransferOrderDetail[];
    unmatchedCatalog: TransferOrderDetail[];
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
    },
  };
}

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '';
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
         ON CONFLICT DO NOTHING`,
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
     ON CONFLICT DO NOTHING`,
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
  /**
   * Which existing order an incoming one is considered to BE.
   *
   *  • `'orderId'` (default) — match on `order_id` alone, and collapse every
   *    duplicate found onto the richest row. This is the spreadsheet contract:
   *    one sheet describes one channel's orders, and the same id appearing
   *    twice is a duplicate row to clean up.
   *  • `'accountSourceAndOrderId'` — match within the channel, mirroring the
   *    `idx_orders_unique_account_order` constraint the API connectors upsert
   *    against. REQUIRED for connectors: order numbers are only unique per
   *    marketplace, so Shopify "1001" and ShipStation "1001" are different
   *    orders and matching on the id alone would delete one of them.
   */
  matchOn?: 'orderId' | 'accountSourceAndOrderId';
  /**
   * Fields this source is AUTHORITATIVE for and may refresh on an order that
   * already exists. Default is none — every field is additive-only, i.e. it
   * fills a blank and never overwrites, so an operator's correction survives
   * the next sync.
   *
   * API connectors set these because the marketplace, not the operator, is the
   * system of record for them.
   */
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
  /**
   * Maintain the canonical `work_assignments` TEST deadline row. Default true.
   *
   * Connectors pass false: they carry no ship-by, and upserting a null deadline
   * would CREATE an OPEN TEST assignment for every synced order — filling the
   * tech queue with in-store Square sales that are already fulfilled.
   */
  manageDeadlines?: boolean;
  /**
   * Title stored on INSERT when neither the source nor the catalog knows one
   * (e.g. `'Square order'`). It is deliberately NOT used on update, so a real
   * title that arrives later replaces it, and it can never overwrite one.
   *
   * This is what the connectors' `COALESCE(NULLIF(EXCLUDED.product_title,
   * '<placeholder>'), orders.product_title)` expressed: adapters emit `''` for
   * "unknown" and the placeholder only ever seeds a brand-new row.
   */
  fallbackProductTitle?: string;
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
    fallbackProductTitle = '',
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

  // ─── Resolve tracking → shipment ids ────────────────────────────────
  // `shipping_tracking_numbers` has NO organization_id column (NEEDS-COL) and
  // these standalone lookups have no org-bearing parent to JOIN, so when an
  // orgId is supplied we GUC-wrap only and leave the predicate unchanged; until
  // the column lands this is the strongest scoping available.
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
    const resolved = await resolveShipmentId(tracking);
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
    createdAt: ordersTable.createdAt,
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
    createdAt: order.createdAt ?? null,
  });

  // Rows arrive newest-first, so the first sighting of an order id is latest.
  const latestOrderByKey = new Map<string, OrderProjection>();
  const allOrdersByKey = new Map<string, OrderProjection[]>();
  existingOrders.forEach((order) => {
    const orderId = String(order.orderId || '').trim();
    if (!orderId || Number.isNaN(Number(order.id))) return;
    const key = matchKey(order.accountSource, orderId);
    const projection = toProjection(order);
    if (!latestOrderByKey.has(key)) latestOrderByKey.set(key, projection);
    const rows = allOrdersByKey.get(key) ?? [];
    rows.push(projection);
    allOrdersByKey.set(key, rows);
  });

  const latestCustomerByOrderId = pickLatestByKey(sourceCustomers, (customer) =>
    String(customer.orderId || '').trim(),
  );

  // ─── Hydrate catalog identity ───────────────────────────────────────
  // Blank titles fill from the SKU / platform item# crosswalk; title-only rows
  // match the catalog by product_title (minimal small-business sheet).
  const titleBySku = new Map<string, string>();
  const catalogByLookupKey = new Map<string, SkuCatalogTitleMatch>();
  const catalogByTitle = new Map<string, SkuCatalogTitleMatch>();
  {
    const lookupSkus = new Set<string>();
    const lookupItemNumbers = new Set<string>();
    const titlesNeedingCatalog = new Set<string>();
    canonicalOrders.forEach((order) => {
      if (order.sku) lookupSkus.add(order.sku);
      if (order.itemNumber) lookupItemNumbers.add(order.itemNumber);
      if (order.productTitle && !order.sku && !order.itemNumber) {
        titlesNeedingCatalog.add(order.productTitle);
      }
    });

    if (lookupSkus.size > 0) {
      const result = orgId
        ? await tenantQuery(
            orgId,
            `SELECT id, sku, product_title
               FROM sku_catalog
              WHERE sku = ANY($1::text[]) AND product_title IS NOT NULL AND product_title <> ''
                AND organization_id = $2`,
            [Array.from(lookupSkus), orgId],
          )
        : await pool.query(
            `SELECT id, sku, product_title
               FROM sku_catalog
              WHERE sku = ANY($1::text[]) AND product_title IS NOT NULL AND product_title <> ''`,
            [Array.from(lookupSkus)],
          );
      for (const row of result.rows) {
        const sku = String(row.sku || '').trim();
        const title = String(row.product_title || '').trim();
        const id = Number(row.id);
        if (!sku || !title || !Number.isFinite(id)) continue;
        titleBySku.set(sku, title);
        catalogByLookupKey.set(sku, { id, sku, productTitle: title });
      }
    }

    if (lookupItemNumbers.size > 0) {
      const result = orgId
        ? await tenantQuery(
            orgId,
            `SELECT spi.platform_sku, spi.platform_item_id, sc.id, sc.product_title, sc.sku
               FROM sku_platform_ids spi
               JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id
                AND sc.organization_id = spi.organization_id
              WHERE (spi.platform_sku = ANY($1::text[]) OR spi.platform_item_id = ANY($1::text[]))
                AND sc.product_title IS NOT NULL AND sc.product_title <> ''
                AND spi.organization_id = $2`,
            [Array.from(lookupItemNumbers), orgId],
          )
        : await pool.query(
            `SELECT spi.platform_sku, spi.platform_item_id, sc.id, sc.product_title, sc.sku
               FROM sku_platform_ids spi
               JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id
              WHERE (spi.platform_sku = ANY($1::text[]) OR spi.platform_item_id = ANY($1::text[]))
                AND sc.product_title IS NOT NULL AND sc.product_title <> ''`,
            [Array.from(lookupItemNumbers)],
          );
      for (const row of result.rows) {
        const title = String(row.product_title || '').trim();
        const id = Number(row.id);
        const sku = String(row.sku || '').trim();
        if (!title || !Number.isFinite(id) || !sku) continue;
        const match: SkuCatalogTitleMatch = { id, sku, productTitle: title };
        const platformSku = String(row.platform_sku || '').trim();
        const platformItemId = String(row.platform_item_id || '').trim();
        if (platformSku) {
          if (!titleBySku.has(platformSku)) titleBySku.set(platformSku, title);
          if (!catalogByLookupKey.has(platformSku)) catalogByLookupKey.set(platformSku, match);
        }
        if (platformItemId) {
          if (!titleBySku.has(platformItemId)) titleBySku.set(platformItemId, title);
          if (!catalogByLookupKey.has(platformItemId)) catalogByLookupKey.set(platformItemId, match);
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

  const resolveProductTitle = (
    sourceTitle: string,
    sku: string,
    itemNumber: string,
  ): { title: string; source: TransferOrderDetail['titleSource'] } => {
    if (sourceTitle) return { title: sourceTitle, source: 'sheet' };
    const bySku = sku && titleBySku.get(sku);
    if (bySku) return { title: bySku, source: 'sku_catalog' };
    const byItem = itemNumber && titleBySku.get(itemNumber);
    if (byItem) return { title: byItem, source: 'platform_lookup' };
    return { title: '', source: 'none' };
  };

  const resolveCatalogLink = (sourceTitle: string, sku: string, itemNumber: string) => {
    let resolvedSku = sku;
    let resolvedItemNumber = itemNumber;
    let skuCatalogId: number | null = null;
    let titleSource: TransferOrderDetail['titleSource'] = 'sheet';
    let productTitle = sourceTitle;

    const fromKey = (key: string) => catalogByLookupKey.get(key) ?? null;
    const bySku = resolvedSku ? fromKey(resolvedSku) : null;
    const byItem = !bySku && resolvedItemNumber ? fromKey(resolvedItemNumber) : null;
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

  for (const order of canonicalOrders) {
    const orderId = order.externalOrderId;
    const catalogLink = resolveCatalogLink(order.productTitle, order.sku, order.itemNumber);
    const existingOrder = latestOrderByKey.get(matchKey(order.accountSource, orderId));

    const detailRow: TransferOrderDetail = {
      orderId,
      productTitle: catalogLink.productTitle,
      sku: catalogLink.sku,
      itemNumber: catalogLink.itemNumber,
      tracking: order.trackings[0] || '',
      titleSource: catalogLink.titleSource,
      existingAccountSource: existingOrder?.accountSource ?? null,
      existingCreatedAt:
        existingOrder?.createdAt instanceof Date
          ? existingOrder.createdAt.toISOString()
          : typeof existingOrder?.createdAt === 'string'
            ? existingOrder.createdAt
            : null,
    };

    if (catalogLink.titleSource === 'none') detailsUnknownTitle.push(detailRow);
    if (shouldEnqueueCatalogLinkChore({ rawItemNumber: order.itemNumber, skuCatalogId: catalogLink.skuCatalogId })) {
      detailsUnmatchedCatalog.push(detailRow);
      catalogLinkChoresToEnqueue.push({
        itemNumber: order.itemNumber,
        accountSource: order.accountSource,
        productTitle: catalogLink.productTitle,
        sku: catalogLink.sku,
        bumpBy: 1,
      });
    }

    const matchedCustomer = latestCustomerByOrderId.get(orderId);
    const matchedCustomerId = matchedCustomer ? Number(matchedCustomer.id) : Number.NaN;
    const customerId = Number.isFinite(matchedCustomerId) ? matchedCustomerId : null;
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

    if (existingOrder) {
      // Collapse duplicates: keep the row carrying the most populated fields,
      // inherit the losers' shipment ids, delete the rest.
      const candidateList = allOrdersByKey.get(matchKey(order.accountSource, orderId)) ?? [existingOrder];
      let orderToKeep: OrderProjection;
      if (candidateList.length > 1) {
        const score = (o: OrderProjection) =>
          [o.productTitle, o.condition, o.itemNumber, o.sku, o.quantity, o.notes].filter((v) => !isBlank(v)).length;
        const sorted = [...candidateList].sort((a, b) => score(b) - score(a));
        orderToKeep = sorted[0];
        sorted.slice(1).forEach((o) => {
          if (o.shipmentId != null) shipmentIds.add(Number(o.shipmentId));
          ordersToDelete.push({ id: o.id, detail: detailRow });
        });
      } else {
        orderToKeep = candidateList[0];
      }

      // Backfill is additive only — a populated field is never clobbered.
      const updateValues: Record<string, unknown> = {};
      if (isBlank(orderToKeep.orderId) && orderId) updateValues.orderId = orderId;
      if (isBlank(orderToKeep.itemNumber) && catalogLink.itemNumber) updateValues.itemNumber = catalogLink.itemNumber;
      // Additive by default; an authoritative source refreshes the title.
      if (authoritative.productTitle
        ? !!catalogLink.productTitle
        : isBlank(orderToKeep.productTitle) && !!catalogLink.productTitle) {
        updateValues.productTitle = catalogLink.productTitle;
      }
      // Source status lands ONLY while the order is untouched — once an
      // operator has moved it, local progress wins.
      if (
        authoritative.status
        && order.status
        && (isBlank(orderToKeep.status) || orderToKeep.status === 'unassigned')
      ) {
        updateValues.status = order.status;
      }
      if (isBlank(orderToKeep.quantity) && order.quantity) updateValues.quantity = order.quantity;
      if (isBlank(orderToKeep.sku) && catalogLink.sku) updateValues.sku = catalogLink.sku;
      if (isBlank(orderToKeep.condition) && order.condition) updateValues.condition = order.condition;
      if (isBlank(orderToKeep.notes) && order.notes) updateValues.notes = order.notes;
      if (catalogLink.skuCatalogId != null && (isBlank(orderToKeep.sku) || isBlank(orderToKeep.itemNumber))) {
        updateValues.skuCatalogId = catalogLink.skuCatalogId;
      }

      const shipmentIdList = Array.from(shipmentIds.values());
      const primaryShipmentId =
        (orderToKeep.shipmentId != null ? Number(orderToKeep.shipmentId) : null) ?? shipmentIdList[0] ?? null;
      if (orderToKeep.shipmentId == null && primaryShipmentId != null) {
        updateValues.shipmentId = primaryShipmentId;
        updatedOrdersTracking++;
      }
      if (orderToKeep.customerId == null && customerId) updateValues.customerId = customerId;
      if (isBlank(orderToKeep.accountSource) && order.accountSource) updateValues.accountSource = order.accountSource;
      // sale_amount / currency aren't in the projection, so write only when the
      // source actually carried them (additive, never clobbers with a blank).
      if (order.saleAmount != null) updateValues.saleAmount = order.saleAmount;
      if (order.currency) updateValues.currency = order.currency;

      const compacted = compactUpdateValues(updateValues);
      if (Object.keys(compacted).length > 0) {
        ordersToBackfill.push({ id: orderToKeep.id, values: compacted, detail: detailRow });
      }
      if (shipmentIdList.length > 0) {
        shipmentLinksToUpsert.set(orderToKeep.id, { primaryShipmentId, shipmentIds: shipmentIdList });
      }
      if (manageDeadlines) orderDeadlinesToUpsert.push({ id: orderToKeep.id, shipByDate: order.shipByDate });
    } else {
      const shipmentIdList = Array.from(shipmentIds.values());
      ordersToInsert.push({
        shipByDate: order.shipByDate,
        shipmentIds: shipmentIdList,
        detail: detailRow,
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
    for (const entry of ordersToInsert) progress({ type: 'detail', kind: 'inserted', row: entry.detail });

    insertedOrderIds = insertedOrders.map((o) => o.id);
    insertedOrders.forEach((inserted, index) => {
      const planned = ordersToInsert[index];
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
    },
  };
}
