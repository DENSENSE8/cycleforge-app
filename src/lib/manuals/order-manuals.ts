import 'server-only';

import type { PoolClient, QueryResultRow } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeIdentifier } from '@/lib/manuals/identifier-key';
import { resolveSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import { deactivateProductManual } from '@/lib/neon/product-manuals-queries';
import { productPaperworkMatchSql, skuKeySql } from '@/lib/manuals/paperwork-match-sql';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { deleteManualBlob, storeManualFile } from '@/lib/manuals/manual-file-store';
import {
  comparePaperwork,
  defaultPairScope,
  mergePairing,
  paperworkSkuKey,
  paperworkSources,
  scopePairing,
  type OrderPaperworkKeys,
  type PaperworkPairing,
  type PaperworkPairingTarget,
  type PaperworkPairScope,
  type PaperworkSource,
} from '@/lib/manuals/paperwork-pairing';
import type { PrepackManual } from '@/lib/prepack/types';
import { MANUAL_USAGE_SELECT, toManualWithUsage, type ManualUsageRow } from '@/lib/manuals/manual-usage';

/** Paperwork for one order — manuals, packing lists and any other `product_manuals` row — behind `/api/orders/[id]/manuals` (the To-ship… */

export interface OrderManual {
  id: number;
  displayName: string;
  type: string | null;
  fileName: string | null;
  /** Same-origin bytes route when the manual has stored content, else null. */
  contentUrl: string | null;
  /** Google Docs preview when the manual is a Google Doc, else null. */
  externalUrl: string | null;
  /** Most specific source it resolves under for this order; null once re-paired away. */
  source: PaperworkSource | null;
  /** Every source it resolves under for this order, most specific first. */
  pairedBy: PaperworkSource[];
  /** Where the row is pinned (SKU reads the catalog SKU when only the catalog id is set). */
  pairing: PaperworkPairing;
  updatedAt: string;
}

interface OrderManualList {
  orderId: number;
  itemNumber: string | null;
  /** The governing SKU: the catalog row's SKU when resolved, else the order's. */
  sku: string | null;
  skuCatalogId: number | null;
  /** What a new upload / library pair pins when the caller doesn't say. */
  defaultPairTo: PaperworkPairScope;
  /** Precedence order: this order, item number, SKU; newest first within each. */
  manuals: OrderManual[];
}

export class OrderManualError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OrderManualError';
  }
}

interface ManualRow {
  id: string | number;
  display_name: string | null;
  type: string | null;
  file_name: string | null;
  source_url: string | null;
  google_file_id: string | null;
  order_id: number | null;
  item_number: string | null;
  sku: string | null;
  sku_catalog_id: number | null;
  catalog_sku: string | null;
  updated_at: Date | string | null;
}

interface OrderPaperworkContext extends OrderPaperworkKeys {
  itemNumber: string | null;
  /** Governing SKU — catalog SKU when resolved, else the order's SKU. */
  sku: string | null;
}

/** Row + its catalog SKU (exact, org-scoped join — the SKU identity law). */
const MANUAL_SELECT = `SELECT pm.id, pm.display_name, pm.type, pm.file_name, pm.source_url, pm.google_file_id,
       pm.order_id, pm.item_number, pm.sku, pm.sku_catalog_id, sc.sku AS catalog_sku, pm.updated_at
  FROM product_manuals pm
  LEFT JOIN sku_catalog sc ON sc.id = pm.sku_catalog_id AND sc.organization_id = pm.organization_id`;

/** The SKU tier of the paperwork match (`productPaperworkMatchSql`): pinned to the catalog row, or to the SKU key. */
const skuTierSql = (catalogParam: string, keyParam: string) =>
  `(${catalogParam}::int IS NOT NULL AND pm.sku_catalog_id = ${catalogParam}::int)
          OR (${keyParam}::text <> '' AND ${skuKeySql('pm.sku')} = ${keyParam}::text)`;

/** `/api/product-manuals/{id}/content` when the manual has http-stored bytes. */
export function manualContentUrl(id: number, sourceUrl: string | null | undefined): string | null {
  return String(sourceUrl || '').trim().startsWith('http') ? productManualContentPath(id) : null;
}

function pairingOf(row: ManualRow): PaperworkPairing {
  return {
    orderId: row.order_id != null ? Number(row.order_id) : null,
    itemNumber: row.item_number?.trim() || null,
    sku: row.sku?.trim() || row.catalog_sku?.trim() || null,
    skuCatalogId: row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
  };
}

function toOrderManual(row: ManualRow, ctx: OrderPaperworkContext): OrderManual {
  const id = Number(row.id);
  const pairing = pairingOf(row);
  const pairedBy = paperworkSources(pairing, ctx);
  const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString();
  const contentUrl = manualContentUrl(id, row.source_url);
  return {
    id,
    displayName: row.display_name?.trim() || row.file_name?.trim() || `Manual ${id}`,
    type: row.type || null,
    fileName: row.file_name || null,
    // Versioned: the content route is browser-cached, and Replace keeps the id.
    contentUrl: contentUrl ? `${contentUrl}?v=${Date.parse(updatedAt)}` : null,
    externalUrl: row.google_file_id ? `https://docs.google.com/document/d/${row.google_file_id}/preview` : null,
    source: pairedBy[0] ?? null,
    pairedBy,
    pairing,
    updatedAt,
  };
}

async function loadOrderContext(orgId: OrgId, orderId: number): Promise<OrderPaperworkContext> {
  const res = await tenantQuery<{
    item_number: string | null;
    sku: string | null;
    sku_catalog_id: number | null;
    catalog_sku: string | null;
  }>(
    orgId,
    `SELECT o.item_number, o.sku, o.sku_catalog_id, sc.sku AS catalog_sku
       FROM orders o
       LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id AND sc.organization_id = o.organization_id
      WHERE o.id = $1 AND o.organization_id = $2`,
    [orderId, orgId],
  );
  const order = res.rows[0];
  if (!order) throw new OrderManualError('Order not found', 404);

  const itemNumber = order.item_number?.trim() || null;
  const orderSku = order.sku?.trim() || null;
  let skuCatalogId = order.sku_catalog_id != null ? Number(order.sku_catalog_id) : null;
  let catalogSku = order.catalog_sku?.trim() || null;
  if (skuCatalogId == null && (itemNumber || orderSku)) {
    skuCatalogId = await resolveSkuCatalogId(orderSku, itemNumber, null, orgId);
    if (skuCatalogId != null) {
      const sc = await tenantQuery<{ sku: string | null }>(
        orgId,
        `SELECT sku FROM sku_catalog WHERE id = $1 AND organization_id = $2`,
        [skuCatalogId, orgId],
      );
      catalogSku = sc.rows[0]?.sku?.trim() || null;
    }
  }
  return {
    orderId,
    itemNumber,
    sku: catalogSku ?? orderSku,
    itemKey: normalizeIdentifier(itemNumber || ''),
    skuKey: paperworkSkuKey(orderSku),
    skuCatalogId,
  };
}

async function bustManualCaches(orgId: OrgId): Promise<void> {
  await invalidateCacheTags(orgId, [CACHE_TAGS.productManuals]);
  await invalidateCacheTags(['pm:manuals']);
}

async function readManual(client: PoolClient, orgId: OrgId, manualId: number): Promise<ManualRow> {
  const res = await client.query<ManualRow>(`${MANUAL_SELECT} WHERE pm.id = $1 AND pm.organization_id = $2`, [
    manualId,
    orgId,
  ]);
  return res.rows[0]!;
}

/** Active org manual locked for update, or null. */
async function lockManual(client: PoolClient, orgId: OrgId, manualId: number): Promise<ManualRow | null> {
  const res = await client.query<ManualRow>(
    `${MANUAL_SELECT}
      WHERE pm.id = $1 AND pm.organization_id = $2 AND pm.is_active = TRUE
      FOR UPDATE OF pm`,
    [manualId, orgId],
  );
  return res.rows[0] ?? null;
}

/** Locked manual that currently resolves for the order; 404 otherwise. */
async function lockOrderManual(
  client: PoolClient,
  orgId: OrgId,
  ctx: OrderPaperworkContext,
  manualId: number,
): Promise<ManualRow> {
  const row = await lockManual(client, orgId, manualId);
  if (!row || paperworkSources(pairingOf(row), ctx).length === 0) {
    throw new OrderManualError('Manual not found for this order', 404);
  }
  return row;
}

/**
 * The catalog id a SKU pairing pins: the order's own catalog row when it is
 * the order's SKU, the row's current one when the SKU is unchanged, else the
 * catalog resolve (null when the SKU has no catalog row yet).
 */
async function catalogIdForSku(
  orgId: OrgId,
  ctx: OrderPaperworkContext,
  sku: string | null,
  current: PaperworkPairing | null,
): Promise<number | null> {
  if (!sku) return null;
  const key = paperworkSkuKey(sku);
  if (ctx.skuCatalogId != null && (key === ctx.skuKey || key === paperworkSkuKey(ctx.sku))) return ctx.skuCatalogId;
  if (current?.skuCatalogId != null && key === paperworkSkuKey(current.sku)) return current.skuCatalogId;
  return resolveSkuCatalogId(sku, null, null, orgId);
}

/** Pin a locked row to exactly `target`; a foreign order id 404s. */
async function writePairing(
  client: PoolClient,
  orgId: OrgId,
  manualId: number,
  target: PaperworkPairingTarget,
  skuCatalogId: number | null,
): Promise<void> {
  if (target.orderId != null) {
    const order = await client.query(`SELECT 1 FROM orders WHERE id = $1 AND organization_id = $2`, [
      target.orderId,
      orgId,
    ]);
    if (order.rowCount === 0) throw new OrderManualError('Order to pair to not found', 404);
  }
  await client.query(
    `UPDATE product_manuals
        SET order_id = $3::int,
            item_number = $4,
            sku = $5,
            sku_catalog_id = $6::int,
            status = 'assigned',
            assigned_at = COALESCE(assigned_at, NOW()),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [manualId, orgId, target.orderId, target.itemNumber, target.sku, skuCatalogId],
  );
}

async function resolveOrderRows(orgId: OrgId, ctx: OrderPaperworkContext): Promise<ManualRow[]> {
  const res = await tenantQuery<ManualRow>(
    orgId,
    `${MANUAL_SELECT}
      WHERE pm.organization_id = $1
        AND ${productPaperworkMatchSql({ pm: 'pm', lineId: '$2::int', itemKey: '$3::text', catalogId: '$4::int', skuKey: '$5::text' })}`,
    [orgId, ctx.orderId, ctx.itemKey, ctx.skuCatalogId, ctx.skuKey],
  );
  return res.rows;
}

export async function listOrderManuals(orgId: OrgId, orderId: number): Promise<OrderManualList> {
  const ctx = await loadOrderContext(orgId, orderId);
  const manuals = (await resolveOrderRows(orgId, ctx)).map((row) => toOrderManual(row, ctx));
  manuals.sort(comparePaperwork);
  return {
    orderId,
    itemNumber: ctx.itemNumber,
    sku: ctx.sku,
    skuCatalogId: ctx.skuCatalogId,
    defaultPairTo: defaultPairScope(ctx),
    manuals,
  };
}

interface OrderPaperworkPrintRow {
  id: number;
  displayName: string;
  sourceUrl: string | null;
  fileName: string | null;
  sku: string | null;
  itemNumber: string | null;
}

/** Pack print's read of the same resolution, in precedence order. Unknown order → []. */
export async function listOrderPaperworkForPrint(orgId: OrgId, orderId: number): Promise<OrderPaperworkPrintRow[]> {
  let ctx: OrderPaperworkContext;
  try {
    ctx = await loadOrderContext(orgId, orderId);
  } catch (error) {
    if (error instanceof OrderManualError && error.status === 404) return [];
    throw error;
  }
  const rows = await resolveOrderRows(orgId, ctx);
  return rows
    .map((row) => ({ row, manual: toOrderManual(row, ctx) }))
    .sort((a, b) => comparePaperwork(a.manual, b.manual))
    .map(({ row, manual }) => ({
      id: manual.id,
      displayName: manual.displayName,
      sourceUrl: row.source_url?.trim() || null,
      fileName: manual.fileName,
      sku: manual.pairing.sku,
      itemNumber: manual.pairing.itemNumber,
    }));
}

/**
 * The SKU tier of the same resolution for one catalog row: the row pack print
 * reads for an order of this SKU (newest first, as `comparePaperwork` orders a
 * tier) unless an order / item-number row outranks it. Null when unpaired.
 */
export async function resolveSkuPaperworkManual(
  run: <T extends QueryResultRow>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>,
  orgId: OrgId,
  skuCatalogId: number,
  sku: string | null,
): Promise<PrepackManual | null> {
  const res = await run<ManualUsageRow>(
    `${MANUAL_USAGE_SELECT}
      WHERE pm.organization_id = $1
        AND pm.is_active = TRUE
        AND pm.status = 'assigned'
        AND (${skuTierSql('$2', '$3')})
      ORDER BY pm.updated_at DESC NULLS LAST, pm.id DESC
      LIMIT 1`,
    [orgId, skuCatalogId, paperworkSkuKey(sku)],
  );
  const row = res.rows[0];
  return row ? toManualWithUsage(row) : null;
}

/** Upload a new paperwork file pinned to this order, its item number or its SKU. */
export async function createOrderManualFromFile(
  orgId: OrgId,
  orderId: number,
  file: File,
  opts: { displayName?: string | null; type?: string | null; pairTo?: PaperworkPairScope | null },
): Promise<OrderManual> {
  const ctx = await loadOrderContext(orgId, orderId);
  const target = scopePairing(opts.pairTo ?? defaultPairScope(ctx), ctx);
  const skuCatalogId = await catalogIdForSku(orgId, ctx, target.sku, null);

  const stored = await storeManualFile(file);
  const displayName = opts.displayName?.trim() || stored.fileName.replace(/\.[a-z0-9]+$/i, '');
  try {
    const row = await withTenantTransaction(orgId, async (client) => {
      const res = await client.query<{ id: string | number }>(
        `INSERT INTO product_manuals
           (organization_id, order_id, sku, item_number, sku_catalog_id, display_name, type, file_name,
            source_url, folder_path, status, assigned_at, is_active, updated_at)
         VALUES ($1, $2::int, $3, $4, $5::int, $6, $7, $8, $9, $10, 'assigned', NOW(), TRUE, NOW())
         RETURNING id`,
        [
          orgId,
          target.orderId,
          target.sku,
          target.itemNumber,
          skuCatalogId,
          displayName,
          opts.type?.trim() || null,
          stored.fileName,
          stored.url,
          // Library convention for item-assigned manuals (see upsertProductManual).
          target.itemNumber ? `assigned/${target.itemNumber}` : null,
        ],
      );
      return readManual(client, orgId, Number(res.rows[0]!.id));
    });
    await bustManualCaches(orgId);
    return toOrderManual(row, ctx);
  } catch (error) {
    await deleteManualBlob(stored.url);
    throw error;
  }
}

/**
 * Pair an existing org manual from the order: adds the scoped key (this order,
 * its item number or its SKU) and keeps the row's other keys. Returns the
 * manual and its prior pairing.
 */
export async function pairExistingManualToOrder(
  orgId: OrgId,
  orderId: number,
  manualId: number,
  pairTo?: PaperworkPairScope | null,
): Promise<{ manual: OrderManual; before: PaperworkPairing }> {
  const ctx = await loadOrderContext(orgId, orderId);
  const added = scopePairing(pairTo ?? defaultPairScope(ctx), ctx);

  const { row, before } = await withTenantTransaction(orgId, async (client) => {
    const existing = await lockManual(client, orgId, manualId);
    if (!existing) throw new OrderManualError('Manual not found', 404);
    const current = pairingOf(existing);
    const target = mergePairing(current, added);
    const skuCatalogId = await catalogIdForSku(orgId, ctx, target.sku, current);
    await writePairing(client, orgId, manualId, target, skuCatalogId);
    return { row: await readManual(client, orgId, manualId), before: current };
  });
  await bustManualCaches(orgId);
  return { manual: toOrderManual(row, ctx), before };
}

/**
 * Rename / retype / re-pair a manual that resolves for the order. `pairing`
 * is the COMPLETE new pinning (order / item number / SKU); the row may leave
 * this order entirely. Returns the manual and its prior pairing.
 */
export async function updateOrderManual(
  orgId: OrgId,
  orderId: number,
  manualId: number,
  patch: { displayName?: string; type?: string | null; pairing?: PaperworkPairingTarget },
): Promise<{ manual: OrderManual; before: PaperworkPairing }> {
  if (patch.displayName !== undefined && !patch.displayName.trim()) {
    throw new OrderManualError('displayName cannot be empty', 400);
  }
  if (patch.displayName === undefined && patch.type === undefined && patch.pairing === undefined) {
    throw new OrderManualError('displayName, type or pairing is required', 400);
  }
  const ctx = await loadOrderContext(orgId, orderId);
  const { row, before } = await withTenantTransaction(orgId, async (client) => {
    const existing = await lockOrderManual(client, orgId, ctx, manualId);
    const current = pairingOf(existing);
    if (patch.pairing) {
      const skuCatalogId = await catalogIdForSku(orgId, ctx, patch.pairing.sku, current);
      await writePairing(client, orgId, manualId, patch.pairing, skuCatalogId);
    }
    if (patch.displayName !== undefined || patch.type !== undefined) {
      await client.query(
        `UPDATE product_manuals
            SET display_name = COALESCE($3, display_name),
                type = CASE WHEN $5 THEN $4 ELSE type END,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [manualId, orgId, patch.displayName?.trim() ?? null, patch.type?.trim() || null, patch.type !== undefined],
      );
    }
    return { row: await readManual(client, orgId, manualId), before: current };
  });
  await bustManualCaches(orgId);
  return { manual: toOrderManual(row, ctx), before };
}

/** Swap the stored file of a manual that resolves for the order. */
export async function replaceOrderManualFile(
  orgId: OrgId,
  orderId: number,
  manualId: number,
  file: File,
  displayName?: string | null,
): Promise<OrderManual> {
  const ctx = await loadOrderContext(orgId, orderId);
  // Ownership check before the (slow) blob upload; re-checked under lock below.
  await withTenantTransaction(orgId, (client) => lockOrderManual(client, orgId, ctx, manualId));

  const stored = await storeManualFile(file);
  let result: { row: ManualRow; previousUrl: string | null };
  try {
    result = await withTenantTransaction(orgId, async (client) => {
      const existing = await lockOrderManual(client, orgId, ctx, manualId);
      await client.query(
        `UPDATE product_manuals
            SET source_url = $3,
                file_name = $4,
                display_name = COALESCE($5, display_name),
                thumbnail_url = NULL,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [manualId, orgId, stored.url, stored.fileName, displayName?.trim() || null],
      );
      return { row: await readManual(client, orgId, manualId), previousUrl: existing.source_url };
    });
  } catch (error) {
    await deleteManualBlob(stored.url);
    throw error;
  }
  if (result.previousUrl && result.previousUrl !== stored.url) {
    await deleteManualBlob(result.previousUrl);
  }
  await bustManualCaches(orgId);
  return toOrderManual(result.row, ctx);
}

/**
 * Remove a manual that resolves for the order. `unpair` clears every pairing
 * key (order, item number, SKU) and returns it to the library as unassigned;
 * `delete` deactivates it. Returns its prior pairing.
 */
export async function removeOrderManual(
  orgId: OrgId,
  orderId: number,
  manualId: number,
  mode: 'unpair' | 'delete',
): Promise<PaperworkPairing> {
  const ctx = await loadOrderContext(orgId, orderId);
  const before = await withTenantTransaction(orgId, async (client) => {
    const existing = await lockOrderManual(client, orgId, ctx, manualId);
    if (mode === 'unpair') {
      await client.query(
        `UPDATE product_manuals
            SET order_id = NULL,
                sku_catalog_id = NULL,
                item_number = NULL,
                sku = NULL,
                status = 'unassigned',
                assigned_at = NULL,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [manualId, orgId],
      );
    }
    return pairingOf(existing);
  });
  if (mode === 'delete') await deactivateProductManual(manualId, orgId);
  await bustManualCaches(orgId);
  return before;
}

interface ManualZipFile {
  manualId: number;
  /** ZIP entry name: `manual_<safe name>.<ext>` (pdf unless the bytes are an image). */
  baseName: string;
  bytes: Buffer;
}

const MANUAL_FETCH_TIMEOUT_MS = 30_000;

async function fetchBytes(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(MANUAL_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: (res.headers.get('content-type') || '').toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Bytes for the ZIP download, org-scoped and in request order. Stored files
 * are fetched from source_url; Google-only manuals try the Docs PDF export
 * and are skipped when it doesn't yield a PDF (private docs return HTML).
 */
export async function readManualFilesForZip(orgId: OrgId, manualIds: number[]): Promise<ManualZipFile[]> {
  if (manualIds.length === 0) return [];
  const res = await tenantQuery<ManualRow>(
    orgId,
    `${MANUAL_SELECT}
      WHERE pm.id = ANY($1::bigint[]) AND pm.organization_id = $2 AND pm.is_active = TRUE`,
    [manualIds, orgId],
  );
  const byId = new Map(res.rows.map((row) => [Number(row.id), row]));

  const files: ManualZipFile[] = [];
  for (const manualId of manualIds) {
    const row = byId.get(manualId);
    if (!row) continue;

    const sourceUrl = String(row.source_url || '').trim();
    let fetched: { bytes: Buffer; contentType: string } | null = null;
    if (sourceUrl.startsWith('http')) {
      fetched = await fetchBytes(sourceUrl);
    } else if (row.google_file_id) {
      const exported = await fetchBytes(
        `https://docs.google.com/document/d/${encodeURIComponent(row.google_file_id)}/export?format=pdf`,
      );
      fetched = exported && exported.contentType.includes('pdf') ? exported : null;
    }
    if (!fetched || fetched.bytes.length === 0) continue;

    const ext = fetched.contentType.startsWith('image/png')
      ? 'png'
      : fetched.contentType.startsWith('image/jpeg')
        ? 'jpg'
        : 'pdf';
    const stem = (row.display_name?.trim() || row.file_name?.trim() || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    files.push({ manualId, baseName: `${stem || `manual-${manualId}`}.${ext}`, bytes: fetched.bytes });
  }
  return files;
}

/** A manual ↔ SKU link, as applied: who it was, where it was pinned, where it is now. */
export interface ManualSkuLink {
  manualId: number;
  displayName: string;
  fileName: string | null;
  /** The catalog row's own SKU spelling. */
  sku: string;
  skuCatalogId: number;
  before: PaperworkPairing;
}

/** ADD the catalog row's SKU key to a locked manual, keeping its order / item-number keys. */
async function pinLockedManualToCatalog(
  client: PoolClient,
  orgId: OrgId,
  existing: ManualRow,
  catalog: { id: number; sku: string },
): Promise<ManualSkuLink> {
  const manualId = Number(existing.id);
  const before = pairingOf(existing);
  const target = mergePairing(before, { orderId: null, itemNumber: null, sku: catalog.sku.trim() });
  await writePairing(client, orgId, manualId, target, Number(catalog.id));
  return {
    manualId,
    displayName: existing.display_name?.trim() || existing.file_name?.trim() || `Manual ${manualId}`,
    fileName: existing.file_name || null,
    sku: catalog.sku.trim(),
    skuCatalogId: Number(catalog.id),
    before,
  };
}

/**
 * Pin an org manual to a catalog SKU inside the caller's transaction (the
 * assistant's `product_manual.link_sku` apply). Like pairing from an order it
 * ADDS the SKU key and keeps the row's order / item-number keys, so the manual
 * resolves — and pack-prints — for every order of that SKU. The SKU must be an
 * org catalog row: a typo is refused, never stored as a dangling key.
 */
export async function linkManualToSkuInTx(
  client: PoolClient,
  orgId: OrgId,
  manualId: number,
  sku: string,
): Promise<ManualSkuLink> {
  const existing = await lockManual(client, orgId, manualId);
  if (!existing) throw new OrderManualError(`Manual ${manualId} not found`, 404);
  const key = paperworkSkuKey(sku);
  if (!key) throw new OrderManualError('SKU needs a letter or digit', 400);
  const catalog = await client.query<{ id: number; sku: string }>(
    `SELECT id, sku FROM sku_catalog
      WHERE organization_id = $1
        AND regexp_replace(UPPER(TRIM(sku)), '[^A-Z0-9]', '', 'g') = $2
      ORDER BY id
      LIMIT 1`,
    [orgId, key],
  );
  const hit = catalog.rows[0];
  if (!hit) throw new OrderManualError(`SKU ${sku.trim()} is not in the catalog`, 404);
  return pinLockedManualToCatalog(client, orgId, existing, hit);
}

/** Same pin by catalog id (a receiving line's resolved SKU). */
export async function linkManualToCatalogInTx(
  client: PoolClient,
  orgId: OrgId,
  manualId: number,
  skuCatalogId: number,
): Promise<ManualSkuLink> {
  const existing = await lockManual(client, orgId, manualId);
  if (!existing) throw new OrderManualError(`Manual ${manualId} not found`, 404);
  const catalog = await client.query<{ id: number; sku: string }>(
    `SELECT id, sku FROM sku_catalog WHERE id = $1 AND organization_id = $2`,
    [skuCatalogId, orgId],
  );
  const hit = catalog.rows[0];
  if (!hit) throw new OrderManualError(`Catalog SKU ${skuCatalogId} not found`, 404);
  return pinLockedManualToCatalog(client, orgId, existing, hit);
}

/**
 * Take a manual off a catalog SKU: clears its SKU key (catalog id and SKU
 * text) and keeps its order / item-number keys; a row left with no key goes
 * back to the library unassigned. 404 when it is not pinned to that SKU.
 * Returns its prior pairing.
 */
export async function unlinkManualFromCatalogInTx(
  client: PoolClient,
  orgId: OrgId,
  manualId: number,
  skuCatalogId: number,
): Promise<PaperworkPairing> {
  const existing = await lockManual(client, orgId, manualId);
  if (!existing) throw new OrderManualError(`Manual ${manualId} not found`, 404);
  const before = pairingOf(existing);
  if (existing.sku_catalog_id == null || Number(existing.sku_catalog_id) !== skuCatalogId) {
    throw new OrderManualError('Manual is not paired to this SKU', 404);
  }
  await restoreManualPairingInTx(client, orgId, manualId, { ...before, sku: null, skuCatalogId: null });
  return before;
}

/**
 * Put a manual's pairing back exactly as it was (the link's inverse). A row
 * that had no key at all returns to the library as unassigned.
 */
export async function restoreManualPairingInTx(
  client: PoolClient,
  orgId: OrgId,
  manualId: number,
  pairing: PaperworkPairing,
): Promise<void> {
  const existing = await lockManual(client, orgId, manualId);
  if (!existing) throw new OrderManualError(`Manual ${manualId} not found`, 404);
  const unpaired = pairing.orderId == null && !pairing.itemNumber && !pairing.sku && pairing.skuCatalogId == null;
  await client.query(
    `UPDATE product_manuals
        SET order_id = $3::int,
            item_number = $4,
            sku = $5,
            sku_catalog_id = $6::int,
            status = CASE WHEN $7 THEN 'unassigned' ELSE 'assigned' END,
            assigned_at = CASE WHEN $7 THEN NULL ELSE COALESCE(assigned_at, NOW()) END,
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [manualId, orgId, pairing.orderId, pairing.itemNumber, pairing.sku, pairing.skuCatalogId, unpaired],
  );
}

/** After a link / restore commits: the manual caches bust. */
export async function settleManualRepair(orgId: OrgId): Promise<void> {
  await bustManualCaches(orgId);
}
