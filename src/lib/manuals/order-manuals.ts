import 'server-only';

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeIdentifier } from '@/lib/product-manuals';
import { resolveSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import { deactivateProductManual } from '@/lib/neon/product-manuals-queries';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { deleteManualBlob, storeManualFile } from '@/lib/manuals/manual-file-store';

/**
 * SKU manuals for one order — the To-ship paperwork walk
 * (`/api/orders/[id]/manuals`). A manual belongs to an order when, within the
 * order's org, it is active and matches ANY of:
 *   - catalog      sku_catalog_id = resolveSkuCatalogId(order sku, order item#)
 *   - item_number  normalized item_number = order's normalized item_number
 *   - sku          UPPER(TRIM(sku)) = order's UPPER(TRIM(sku))
 * Every write is org-predicated and busts the manual caches that
 * `/api/manuals/resolve` and the library read through.
 */

export type ManualPairing = 'catalog' | 'item_number' | 'sku';

export interface OrderManual {
  id: number;
  displayName: string;
  type: string | null;
  fileName: string | null;
  /** Same-origin bytes route when the manual has stored content, else null. */
  contentUrl: string | null;
  /** Google Docs preview when the manual is a Google Doc, else null. */
  externalUrl: string | null;
  pairedBy: ManualPairing[];
  updatedAt: string;
}

export interface OrderManualList {
  itemNumber: string | null;
  sku: string | null;
  skuCatalogId: number | null;
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
  item_number: string | null;
  sku: string | null;
  sku_catalog_id: number | null;
  updated_at: Date | string | null;
}

interface OrderManualContext {
  orderId: number;
  itemNumber: string | null;
  sku: string | null;
  /** normalizeIdentifier(item_number) — '' when absent. */
  itemKey: string;
  /** UPPER(TRIM(sku)) — '' when absent. */
  skuKey: string;
  skuCatalogId: number | null;
}

const MANUAL_COLUMNS = `id, display_name, type, file_name, source_url, google_file_id,
  item_number, sku, sku_catalog_id, updated_at`;

/** SQL twin of normalizeIdentifier: UPPER alnum, leading zeros stripped. */
const ITEM_KEY_SQL = `regexp_replace(regexp_replace(UPPER(TRIM(COALESCE(item_number, ''))), '[^A-Z0-9]', '', 'g'), '^0+', '')`;

/** `/api/product-manuals/{id}/content` when the manual has http-stored bytes. */
export function manualContentUrl(id: number, sourceUrl: string | null | undefined): string | null {
  return String(sourceUrl || '').trim().startsWith('http') ? productManualContentPath(id) : null;
}

function pairingsFor(row: ManualRow, ctx: OrderManualContext): ManualPairing[] {
  const pairedBy: ManualPairing[] = [];
  if (ctx.skuCatalogId != null && row.sku_catalog_id != null && Number(row.sku_catalog_id) === ctx.skuCatalogId) {
    pairedBy.push('catalog');
  }
  if (ctx.itemKey && normalizeIdentifier(row.item_number || '') === ctx.itemKey) pairedBy.push('item_number');
  if (ctx.skuKey && (row.sku || '').trim().toUpperCase() === ctx.skuKey) pairedBy.push('sku');
  return pairedBy;
}

function toOrderManual(row: ManualRow, ctx: OrderManualContext): OrderManual {
  const id = Number(row.id);
  return {
    id,
    displayName: row.display_name?.trim() || row.file_name?.trim() || `Manual ${id}`,
    type: row.type || null,
    fileName: row.file_name || null,
    contentUrl: manualContentUrl(id, row.source_url),
    externalUrl: row.google_file_id ? `https://docs.google.com/document/d/${row.google_file_id}/preview` : null,
    pairedBy: pairingsFor(row, ctx),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
  };
}

async function loadOrderContext(orgId: OrgId, orderId: number): Promise<OrderManualContext> {
  const res = await tenantQuery<{ item_number: string | null; sku: string | null }>(
    orgId,
    `SELECT item_number, sku FROM orders WHERE id = $1 AND organization_id = $2`,
    [orderId, orgId],
  );
  const order = res.rows[0];
  if (!order) throw new OrderManualError('Order not found', 404);

  const itemNumber = order.item_number?.trim() || null;
  const sku = order.sku?.trim() || null;
  const skuCatalogId = itemNumber || sku
    ? await resolveSkuCatalogId(sku, itemNumber, null, orgId)
    : null;
  return {
    orderId,
    itemNumber,
    sku,
    itemKey: normalizeIdentifier(itemNumber || ''),
    skuKey: (sku || '').toUpperCase(),
    skuCatalogId,
  };
}

function requirePairableOrder(ctx: OrderManualContext): void {
  if (!ctx.itemKey && !ctx.skuKey) {
    throw new OrderManualError('Order has no item number or SKU to pair a manual to', 400);
  }
}

async function bustManualCaches(orgId: OrgId): Promise<void> {
  await invalidateCacheTags(orgId, [CACHE_TAGS.productManuals]);
  await invalidateCacheTags(['pm:manuals']);
}

/** Active org manual locked for update, or null. */
async function lockManual(client: PoolClient, orgId: OrgId, manualId: number): Promise<ManualRow | null> {
  const res = await client.query<ManualRow>(
    `SELECT ${MANUAL_COLUMNS} FROM product_manuals
      WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
      FOR UPDATE`,
    [manualId, orgId],
  );
  return res.rows[0] ?? null;
}

/** Locked manual that currently belongs to the order; 404 otherwise. */
async function lockOrderManual(
  client: PoolClient,
  orgId: OrgId,
  ctx: OrderManualContext,
  manualId: number,
): Promise<ManualRow> {
  const row = await lockManual(client, orgId, manualId);
  if (!row || pairingsFor(row, ctx).length === 0) {
    throw new OrderManualError('Manual not found for this order', 404);
  }
  return row;
}

export async function listOrderManuals(orgId: OrgId, orderId: number): Promise<OrderManualList> {
  const ctx = await loadOrderContext(orgId, orderId);
  const base = { itemNumber: ctx.itemNumber, sku: ctx.sku, skuCatalogId: ctx.skuCatalogId };
  if (!ctx.itemKey && !ctx.skuKey && ctx.skuCatalogId == null) return { ...base, manuals: [] };

  const res = await tenantQuery<ManualRow>(
    orgId,
    `SELECT ${MANUAL_COLUMNS}
       FROM product_manuals
      WHERE organization_id = $1
        AND is_active = TRUE
        AND (
          ($2::int IS NOT NULL AND sku_catalog_id = $2::int)
          OR ($3::text <> '' AND ${ITEM_KEY_SQL} = $3::text)
          OR ($4::text <> '' AND UPPER(TRIM(COALESCE(sku, ''))) = $4::text)
        )
      ORDER BY updated_at DESC NULLS LAST, id DESC`,
    [orgId, ctx.skuCatalogId, ctx.itemKey, ctx.skuKey],
  );
  return { ...base, manuals: res.rows.map((row) => toOrderManual(row, ctx)) };
}

/** Upload a new manual file and pair it to the order's item number + SKU. */
export async function createOrderManualFromFile(
  orgId: OrgId,
  orderId: number,
  file: File,
  opts: { displayName?: string | null; type?: string | null },
): Promise<OrderManual> {
  const ctx = await loadOrderContext(orgId, orderId);
  requirePairableOrder(ctx);

  const stored = await storeManualFile(file);
  const displayName = opts.displayName?.trim() || stored.fileName.replace(/\.[a-z0-9]+$/i, '');
  try {
    const res = await tenantQuery<ManualRow>(
      orgId,
      `INSERT INTO product_manuals
         (organization_id, sku, item_number, sku_catalog_id, display_name, type, file_name,
          source_url, folder_path, status, assigned_at, is_active, updated_at)
       VALUES ($1, $2, $3, $4::int, $5, $6, $7, $8, $9, 'assigned', NOW(), TRUE, NOW())
       RETURNING ${MANUAL_COLUMNS}`,
      [
        orgId,
        ctx.sku,
        ctx.itemKey || null,
        ctx.skuCatalogId,
        displayName,
        opts.type?.trim() || null,
        stored.fileName,
        stored.url,
        // Library convention for assigned manuals (see upsertProductManual).
        ctx.itemKey ? `assigned/${ctx.itemKey}` : null,
      ],
    );
    await bustManualCaches(orgId);
    return toOrderManual(res.rows[0]!, ctx);
  } catch (error) {
    await deleteManualBlob(stored.url);
    throw error;
  }
}

/**
 * Pair an existing org manual to the order: item_number / sku take the order's
 * values when the order has them; sku_catalog_id takes the resolved catalog id
 * (kept when unresolvable). Returns the manual and its prior pairing.
 */
export async function pairExistingManualToOrder(
  orgId: OrgId,
  orderId: number,
  manualId: number,
): Promise<{ manual: OrderManual; before: Pick<ManualRow, 'item_number' | 'sku' | 'sku_catalog_id'> }> {
  const ctx = await loadOrderContext(orgId, orderId);
  requirePairableOrder(ctx);

  const { row, before } = await withTenantTransaction(orgId, async (client) => {
    const existing = await lockManual(client, orgId, manualId);
    if (!existing) throw new OrderManualError('Manual not found', 404);
    const res = await client.query<ManualRow>(
      `UPDATE product_manuals
          SET item_number = COALESCE($3, item_number),
              sku = COALESCE($4, sku),
              sku_catalog_id = COALESCE($5::int, sku_catalog_id),
              status = 'assigned',
              assigned_at = COALESCE(assigned_at, NOW()),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING ${MANUAL_COLUMNS}`,
      [manualId, orgId, ctx.itemKey || null, ctx.sku, ctx.skuCatalogId],
    );
    return { row: res.rows[0]!, before: existing };
  });
  await bustManualCaches(orgId);
  return {
    manual: toOrderManual(row, ctx),
    before: { item_number: before.item_number, sku: before.sku, sku_catalog_id: before.sku_catalog_id },
  };
}

/** Rename / retype a manual that belongs to the order. */
export async function updateOrderManualDetails(
  orgId: OrgId,
  orderId: number,
  manualId: number,
  patch: { displayName?: string; type?: string | null },
): Promise<OrderManual> {
  if (patch.displayName !== undefined && !patch.displayName.trim()) {
    throw new OrderManualError('displayName cannot be empty', 400);
  }
  if (patch.displayName === undefined && patch.type === undefined) {
    throw new OrderManualError('displayName or type is required', 400);
  }
  const ctx = await loadOrderContext(orgId, orderId);
  const row = await withTenantTransaction(orgId, async (client) => {
    await lockOrderManual(client, orgId, ctx, manualId);
    const res = await client.query<ManualRow>(
      `UPDATE product_manuals
          SET display_name = COALESCE($3, display_name),
              type = CASE WHEN $5 THEN $4 ELSE type END,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING ${MANUAL_COLUMNS}`,
      [
        manualId,
        orgId,
        patch.displayName?.trim() ?? null,
        patch.type?.trim() || null,
        patch.type !== undefined,
      ],
    );
    return res.rows[0]!;
  });
  await bustManualCaches(orgId);
  return toOrderManual(row, ctx);
}

/** Swap the stored file of a manual that belongs to the order. */
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
      const res = await client.query<ManualRow>(
        `UPDATE product_manuals
            SET source_url = $3,
                file_name = $4,
                display_name = COALESCE($5, display_name),
                thumbnail_url = NULL,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING ${MANUAL_COLUMNS}`,
        [manualId, orgId, stored.url, stored.fileName, displayName?.trim() || null],
      );
      return { row: res.rows[0]!, previousUrl: existing.source_url };
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
 * Remove a manual from the order. `unpair` clears its item/SKU/catalog pairing
 * and returns it to the library as unassigned; `delete` deactivates it.
 */
export async function removeOrderManual(
  orgId: OrgId,
  orderId: number,
  manualId: number,
  mode: 'unpair' | 'delete',
): Promise<Pick<ManualRow, 'item_number' | 'sku' | 'sku_catalog_id'>> {
  const ctx = await loadOrderContext(orgId, orderId);
  const before = await withTenantTransaction(orgId, async (client) => {
    const existing = await lockOrderManual(client, orgId, ctx, manualId);
    if (mode === 'unpair') {
      await client.query(
        `UPDATE product_manuals
            SET sku_catalog_id = NULL,
                item_number = NULL,
                sku = NULL,
                status = 'unassigned',
                assigned_at = NULL,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [manualId, orgId],
      );
    }
    return existing;
  });
  if (mode === 'delete') await deactivateProductManual(manualId, orgId);
  await bustManualCaches(orgId);
  return { item_number: before.item_number, sku: before.sku, sku_catalog_id: before.sku_catalog_id };
}

export interface ManualZipFile {
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
    `SELECT ${MANUAL_COLUMNS} FROM product_manuals
      WHERE id = ANY($1::bigint[]) AND organization_id = $2 AND is_active = TRUE`,
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
