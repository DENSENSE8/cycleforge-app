import { tenantQuery, withTenantTransaction } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';
import { photoContentUrl } from '../photos/display-url';
import { skuCatalogNoZohoTwinPredicateSql } from '../sku/sku-identity-law';
import {
  checkMergeAllowed,
  isProvisionalSku,
  normalizeProvisionalBarcode,
  planProvisionalMerge,
  provisionalSkuForBarcode,
  provisionalSkuForSourceRef,
  PROVISIONAL_MERGE_REASON,
  type ProvisionalBinRow,
} from '../inventory/provisional-sku';

/** Database work for provisional (on-hold placeholder) products — the SKU Exceptions queue on the desk (`/inventory/sku-exceptions`) and… */

export interface ProvisionalSkuLocation {
  locationId: number;
  barcode: string;
  room: string | null;
  qty: number;
}

export interface ProvisionalSku {
  sku: string;
  /** `sku_stock.id` — the photo entity id (`SKU_STOCK`). */
  stockId: number;
  productTitle: string;
  description: string | null;
  barcode: string;
  stock: number;
  createdByStaffId: number | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  photoCount: number;
  coverPhotoId: number | null;
  locations: ProvisionalSkuLocation[];
}

export interface ProvisionalSkuPhoto {
  id: number;
  url: string;
  thumbUrl: string;
  createdAt: string;
  takenByStaffId: number | null;
}

export interface ProvisionalSkuDetail extends ProvisionalSku {
  photos: ProvisionalSkuPhoto[];
}

interface ProvisionalRow {
  id: number;
  sku: string;
  product_title: string | null;
  provisional_description: string | null;
  provisional_barcode: string | null;
  stock: number | string | null;
  provisional_created_by: number | null;
  created_by_name: string | null;
  provisional_created_at: Date | string | null;
  updated_at: Date | string | null;
  photo_count: number | string | null;
  cover_photo_id: number | string | null;
  locations: Array<{ locationId: number; barcode: string | null; room: string | null; qty: number }> | null;
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toProvisional(row: ProvisionalRow): ProvisionalSku {
  return {
    sku: row.sku,
    stockId: Number(row.id),
    productTitle: row.product_title ?? row.sku,
    description: row.provisional_description ?? null,
    barcode: row.provisional_barcode ?? '',
    stock: Number(row.stock) || 0,
    createdByStaffId: row.provisional_created_by ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: iso(row.provisional_created_at),
    updatedAt: iso(row.updated_at),
    photoCount: Number(row.photo_count) || 0,
    coverPhotoId: row.cover_photo_id == null ? null : Number(row.cover_photo_id),
    locations: (row.locations ?? []).map((loc) => ({
      locationId: Number(loc.locationId),
      barcode: loc.barcode ?? '',
      room: loc.room ?? null,
      qty: Number(loc.qty) || 0,
    })),
  };
}

/**
 * One SELECT shape for list, detail and write-backs, so every surface reads
 * the same row. `$1` is always the org id.
 */
const PROVISIONAL_SELECT = `
  SELECT ss.id, ss.sku, ss.product_title, ss.provisional_description, ss.provisional_barcode,
         ss.stock, ss.provisional_created_by, st.name AS created_by_name,
         ss.provisional_created_at, ss.updated_at,
         ph.photo_count, ph.cover_photo_id,
         COALESCE(bins.locations, '[]'::json) AS locations
    FROM sku_stock ss
    LEFT JOIN staff st ON st.id = ss.provisional_created_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS photo_count, MIN(l.photo_id) AS cover_photo_id
        FROM photo_entity_links l
       WHERE l.organization_id = ss.organization_id
         AND l.entity_type = 'SKU_STOCK'
         AND l.entity_id = ss.id
         AND l.link_role = 'primary'
    ) ph ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(
               json_build_object('locationId', loc.id, 'barcode', loc.barcode, 'room', loc.room, 'qty', bc.qty)
               ORDER BY loc.barcode
             ) AS locations
        FROM bin_contents bc
        JOIN locations loc ON loc.id = bc.location_id
       WHERE bc.organization_id = ss.organization_id
         AND bc.sku = ss.sku
         AND bc.qty > 0
    ) bins ON true
   WHERE ss.organization_id = $1 AND ss.is_provisional = true`;

/** Mint a placeholder, or return the one that already exists for the same key. */
export async function createProvisionalSku(
  input: {
    barcode?: string | null;
    sourceRef?: string | null;
    productTitle: string;
    description?: string | null;
    staffId?: number | null;
  },
  orgId: OrgId,
): Promise<ProvisionalSku> {
  const hasBarcode = input.barcode != null && input.barcode.trim() !== '';
  const barcode = hasBarcode ? normalizeProvisionalBarcode(input.barcode as string) : null;
  if (hasBarcode && !barcode) throw new Error('Barcode has no usable characters');
  const derivedSku = barcode
    ? provisionalSkuForBarcode(barcode)
    : provisionalSkuForSourceRef(orgId, input.sourceRef?.trim() || globalThis.crypto.randomUUID());
  if (!derivedSku) throw new Error('Could not derive an on-hold SKU');
  const title = input.productTitle.trim();
  if (!title) throw new Error('A name is required for an on-hold product');
  const description = input.description?.trim() || null;

  return withTenantTransaction(orgId, async (db) => {
    // A barcode attached to a barcode-less placeholder after the fact keeps
    // that placeholder's key; scanning the box again must join it, not trip
    // the unique index minting `TMP-<barcode>` beside it.
    let sku = derivedSku;
    if (barcode) {
      const existing = await db.query<{ sku: string }>(
        `SELECT sku FROM sku_stock
          WHERE organization_id = $1 AND is_provisional = true AND provisional_barcode = $2
          LIMIT 1`,
        [orgId, barcode],
      );
      sku = existing.rows[0]?.sku ?? derivedSku;
    }

    // The catalog row FIRST:
    await db.query(
      `INSERT INTO sku_catalog (
         sku, product_title, upc, is_active, organization_id,
         is_provisional, provisional_barcode
       )
       VALUES ($1, $2, $3, false, $4, true, $3)
       ON CONFLICT (organization_id, sku) DO UPDATE
         SET product_title = COALESCE(NULLIF(sku_catalog.product_title, ''), EXCLUDED.product_title),
             updated_at = NOW()`,
      [sku, title, barcode, orgId],
    );

    await db.query(
      `INSERT INTO sku_stock (
         sku, stock, boxed_stock, product_title, organization_id,
         is_provisional, provisional_barcode, provisional_created_by, provisional_created_at,
         provisional_description
       )
       VALUES ($1, 0, 0, $2, $3, true, $4, $5, NOW(), $6)
       ON CONFLICT (organization_id, sku) DO UPDATE
         SET product_title = COALESCE(NULLIF(sku_stock.product_title, ''), EXCLUDED.product_title),
             provisional_description = COALESCE(NULLIF(sku_stock.provisional_description, ''), EXCLUDED.provisional_description),
             updated_at = NOW()`,
      [sku, title, orgId, barcode, input.staffId ?? null, description],
    );

    const result = await db.query<ProvisionalRow>(`${PROVISIONAL_SELECT} AND ss.sku = $2`, [orgId, sku]);
    return toProvisional(result.rows[0]);
  });
}

/** Every unreconciled placeholder in the org, newest first. */
export async function listProvisionalSkus(orgId: OrgId): Promise<ProvisionalSku[]> {
  const result = await tenantQuery<ProvisionalRow>(
    orgId,
    `${PROVISIONAL_SELECT}
     ORDER BY ss.provisional_created_at DESC NULLS LAST, ss.sku`,
    [orgId],
  );
  return result.rows.map(toProvisional);
}

/** One placeholder with its photos, or `null` when no open placeholder has that SKU. */
export async function getProvisionalSkuDetail(
  sku: string,
  orgId: OrgId,
): Promise<ProvisionalSkuDetail | null> {
  const result = await tenantQuery<ProvisionalRow>(orgId, `${PROVISIONAL_SELECT} AND ss.sku = $2`, [
    orgId,
    sku.trim(),
  ]);
  const row = result.rows[0];
  if (!row) return null;
  const photos = await tenantQuery<{ id: string; created_at: Date | string; taken_by_staff_id: number | null }>(
    orgId,
    `SELECT p.id, p.created_at, p.taken_by_staff_id
       FROM photo_entity_links l
       JOIN photos p ON p.id = l.photo_id AND p.organization_id = l.organization_id
      WHERE l.organization_id = $1
        AND l.entity_type = 'SKU_STOCK'
        AND l.entity_id = $2
        AND l.link_role = 'primary'
      ORDER BY p.created_at ASC, p.id ASC`,
    [orgId, row.id],
  );
  return {
    ...toProvisional(row),
    photos: photos.rows.map((p) => {
      const id = Number(p.id);
      return {
        id,
        url: photoContentUrl(id),
        thumbUrl: photoContentUrl(id, 'thumb'),
        createdAt: iso(p.created_at) ?? '',
        takenByStaffId: p.taken_by_staff_id ?? null,
      };
    }),
  };
}

/** The real SKU a placeholder was merged into, or `null` when it never was. */
export async function findProvisionalMergeTarget(sku: string, orgId: OrgId): Promise<string | null> {
  const result = await tenantQuery<{ target_sku: string }>(
    orgId,
    `SELECT target_sku FROM provisional_sku_merges
      WHERE organization_id = $1 AND provisional_sku = $2
      LIMIT 1`,
    [orgId, sku.trim()],
  );
  return result.rows[0]?.target_sku ?? null;
}

/**
 * Why a barcode could not be attached to a placeholder. The route maps
 * `unusable` to 400 and the rest to 409 with `conflictSku`, so the operator is
 * told which record already owns the barcode instead of "failed".
 */
export class ProvisionalBarcodeError extends Error {
  constructor(
    readonly reason: 'unusable' | 'has-barcode' | 'barcode-taken' | 'barcode-is-catalog',
    readonly conflictSku: string | null = null,
  ) {
    super(
      reason === 'unusable'
        ? 'Barcode has no usable characters'
        : reason === 'has-barcode'
          ? 'This on-hold product already has a different barcode'
          : reason === 'barcode-taken'
            ? `Barcode already belongs to on-hold product ${conflictSku}`
            : `Barcode already belongs to catalog SKU ${conflictSku} — pair to it instead`,
    );
    this.name = 'ProvisionalBarcodeError';
  }
}

/** Rename / describe an open placeholder, or attach the barcode a barcode-less one was created without. */
export async function updateProvisionalSku(
  input: { sku: string; productTitle?: string; description?: string | null; barcode?: string },
  orgId: OrgId,
): Promise<ProvisionalSku | null> {
  const sku = input.sku.trim();
  const title = input.productTitle?.trim();
  const hasDescription = input.description !== undefined;
  const description = input.description?.trim() || null;
  const barcode = input.barcode === undefined ? null : normalizeProvisionalBarcode(input.barcode);
  if (input.barcode !== undefined && !barcode) throw new ProvisionalBarcodeError('unusable');

  return withTenantTransaction(orgId, async (db) => {
    if (barcode) {
      const current = await db.query<{ provisional_barcode: string | null }>(
        `SELECT provisional_barcode FROM sku_stock
          WHERE organization_id = $1 AND sku = $2 AND is_provisional = true
          FOR UPDATE`,
        [orgId, sku],
      );
      if (current.rows.length === 0) return null;
      const had = current.rows[0].provisional_barcode;
      if (had && had !== barcode) throw new ProvisionalBarcodeError('has-barcode');
      if (!had) {
        const taken = await db.query<{ sku: string }>(
          `SELECT sku FROM sku_stock
            WHERE organization_id = $1 AND is_provisional = true AND provisional_barcode = $2 AND sku <> $3
            LIMIT 1`,
          [orgId, barcode, sku],
        );
        if (taken.rows[0]) throw new ProvisionalBarcodeError('barcode-taken', taken.rows[0].sku);
        const catalog = await db.query<{ sku: string }>(
          `SELECT sku FROM sku_catalog
            WHERE organization_id = $1 AND is_provisional = false AND upc = $2
            LIMIT 1`,
          [orgId, barcode],
        );
        if (catalog.rows[0]) throw new ProvisionalBarcodeError('barcode-is-catalog', catalog.rows[0].sku);
        await db.query(
          `UPDATE sku_stock SET provisional_barcode = $3, updated_at = NOW()
            WHERE organization_id = $1 AND sku = $2 AND is_provisional = true`,
          [orgId, sku, barcode],
        );
        await db.query(
          `UPDATE sku_catalog
              SET provisional_barcode = $3, upc = COALESCE(NULLIF(upc, ''), $3), updated_at = NOW()
            WHERE organization_id = $1 AND sku = $2 AND is_provisional = true
              AND ${skuCatalogNoZohoTwinPredicateSql()}`,
          [orgId, sku, barcode],
        );
      }
    }

    const updated = await db.query(
      `UPDATE sku_stock
          SET product_title = COALESCE($3, product_title),
              provisional_description = CASE WHEN $4 THEN $5 ELSE provisional_description END,
              updated_at = NOW()
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true`,
      [orgId, sku, title || null, hasDescription, description],
    );
    if ((updated.rowCount ?? 0) === 0) return null;
    if (title) {
      await db.query(
        `UPDATE sku_catalog SET product_title = $3, updated_at = NOW()
          WHERE organization_id = $1 AND sku = $2 AND is_provisional = true
            AND ${skuCatalogNoZohoTwinPredicateSql()}`,
        [orgId, sku, title],
      );
    }
    const result = await db.query<ProvisionalRow>(`${PROVISIONAL_SELECT} AND ss.sku = $2`, [orgId, sku]);
    return toProvisional(result.rows[0]);
  });
}

export interface MergeResult {
  qtyMoved: number;
  binRowsMoved: number;
  ledgerRowsRekeyed: number;
  /** Photo links moved from the placeholder's `sku_stock` row onto the target's. */
  photosMoved: number;
  /** The highest `sku_stock_ledger.id` the merge re-keyed, or `null` when it re-keyed none — the realtime feed key for the move (see the… */
  feedLedgerId: number | null;
}

/**
 * Merge a placeholder into the real SKU:
 * It was weighed and declined (operator 2026-09-13). Re-keying is a RENAME of
 */
export async function mergeProvisionalSku(
  input: { provisionalSku: string; targetSku: string; staffId?: number | null },
  orgId: OrgId,
): Promise<MergeResult> {
  const provisionalSku = input.provisionalSku.trim();
  const targetSku = input.targetSku.trim();
  const allowed = checkMergeAllowed(provisionalSku, targetSku);
  if (!allowed.ok) throw new Error(`Merge refused: ${allowed.reason}`);

  return withTenantTransaction(orgId, async (db) => {
    const placeholder = await db.query<Pick<
      ProvisionalRow,
      'id' | 'product_title' | 'provisional_barcode' | 'provisional_description'
    >>(
      `SELECT id, product_title, provisional_barcode, provisional_description
         FROM sku_stock
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true
        FOR UPDATE`,
      [orgId, provisionalSku],
    );
    if (placeholder.rows.length === 0) {
      throw new Error(`No on-hold product named ${provisionalSku}`);
    }

    // The target must be a real catalog SKU. Without this check the first
    // bin re-key raises `fk_bin_contents_sku`, which reaches the operator as
    // a Postgres constraint name rather than "that SKU does not exist yet".
    const target = await db.query<{ is_provisional: boolean }>(
      `SELECT is_provisional FROM sku_catalog
        WHERE organization_id = $1 AND sku = $2`,
      [orgId, targetSku],
    );
    if (target.rows.length === 0) {
      throw new Error(`No catalog SKU named ${targetSku}`);
    }
    if (target.rows[0].is_provisional) {
      throw new Error('Merge refused: target-is-provisional');
    }

    const bins = await db.query<{ sku: string; location_id: number; qty: number }>(
      `SELECT sku, location_id, qty
         FROM bin_contents
        WHERE organization_id = $1 AND sku IN ($2, $3)
        FOR UPDATE`,
      [orgId, provisionalSku, targetSku],
    );

    const rowsFor = (sku: string): ProvisionalBinRow[] =>
      bins.rows
        .filter((row) => row.sku === sku)
        .map((row) => ({ locationId: row.location_id, qty: Number(row.qty) || 0 }));

    const plan = planProvisionalMerge(rowsFor(provisionalSku), rowsFor(targetSku));

    // Folds first: the target's row absorbs the placeholder's quantity, then the placeholder's row for that location goes.
    for (const fold of plan.folds) {
      await db.query(
        `UPDATE bin_contents SET qty = $1, updated_at = NOW()
          WHERE organization_id = $2 AND location_id = $3 AND sku = $4`,
        [fold.mergedQty, orgId, fold.locationId, targetSku],
      );
      await db.query(
        `DELETE FROM bin_contents
          WHERE organization_id = $1 AND location_id = $2 AND sku = $3`,
        [orgId, fold.locationId, provisionalSku],
      );
    }

    // Re-keys keep the row — and with it min_qty, max_qty and last_counted,
    // which are facts about the BIN's relationship to the physical product and
    // survive the product being correctly named.
    for (const rekey of plan.rekeys) {
      await db.query(
        `UPDATE bin_contents SET sku = $1, updated_at = NOW()
          WHERE organization_id = $2 AND location_id = $3 AND sku = $4`,
        [targetSku, orgId, rekey.locationId, provisionalSku],
      );
    }

    // Any zero-qty placeholder rows the plan skipped are still rows; drop them
    // so the placeholder leaves nothing behind.
    await db.query(
      `DELETE FROM bin_contents WHERE organization_id = $1 AND sku = $2`,
      [orgId, provisionalSku],
    );

    const ledger = await db.query<{ id: number }>(
      `UPDATE sku_stock_ledger
          SET sku = $1
        WHERE organization_id = $2 AND sku = $3
        RETURNING id`,
      [targetSku, orgId, provisionalSku],
    );
    const ledgerRowsRekeyed = ledger.rowCount ?? 0;
    const feedLedgerId = ledger.rows.reduce<number | null>(
      (max, row) => (max == null || row.id > max ? row.id : max),
      null,
    );

    // The target may have had no ledger rows of its own and no trigger fire
    // (a merge of zero rows), so make sure its stock row exists — the photos
    // below need its id either way.
    await db.query(
      `INSERT INTO sku_stock (sku, stock, boxed_stock, organization_id)
       VALUES ($1, 0, 0, $2)
       ON CONFLICT (organization_id, sku) DO NOTHING`,
      [targetSku, orgId],
    );
    const targetStock = await db.query<{ id: number }>(
      `SELECT id FROM sku_stock WHERE organization_id = $1 AND sku = $2`,
      [orgId, targetSku],
    );
    const placeholderStockId = placeholder.rows[0].id;
    const targetStockId = targetStock.rows[0].id;

    // The photos describe the physical product, so they follow it. A photo
    // already linked to the target keeps that link and the duplicate goes.
    const moved = await db.query(
      `UPDATE photo_entity_links l
          SET entity_id = $3
        WHERE l.organization_id = $1 AND l.entity_type = 'SKU_STOCK' AND l.entity_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM photo_entity_links t
             WHERE t.photo_id = l.photo_id AND t.entity_type = 'SKU_STOCK'
               AND t.entity_id = $3 AND t.link_role = l.link_role
          )`,
      [orgId, placeholderStockId, targetStockId],
    );
    await db.query(
      `DELETE FROM photo_entity_links
        WHERE organization_id = $1 AND entity_type = 'SKU_STOCK' AND entity_id = $2`,
      [orgId, placeholderStockId],
    );
    const photosMoved = moved.rowCount ?? 0;

    await db.query(
      `INSERT INTO provisional_sku_merges (
         organization_id, provisional_sku, provisional_barcode, provisional_title,
         provisional_description, target_sku, qty_moved, bin_rows_moved,
         ledger_rows_rekeyed, photos_moved, merged_by_staff_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (organization_id, provisional_sku) DO NOTHING`,
      [
        orgId,
        provisionalSku,
        placeholder.rows[0].provisional_barcode,
        placeholder.rows[0].product_title,
        placeholder.rows[0].provisional_description,
        targetSku,
        plan.qtyMoved,
        plan.binRowsMoved,
        ledgerRowsRekeyed,
        photosMoved,
        input.staffId ?? null,
      ],
    );

    await db.query(
      `DELETE FROM sku_stock
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true`,
      [orgId, provisionalSku],
    );

    // The catalog row goes last.
    await db.query(
      `DELETE FROM sku_catalog
        WHERE organization_id = $1 AND sku = $2 AND is_provisional = true`,
      [orgId, provisionalSku],
    );

    return {
      qtyMoved: plan.qtyMoved,
      binRowsMoved: plan.binRowsMoved,
      ledgerRowsRekeyed,
      photosMoved,
      feedLedgerId,
    };
  });
}

/** Reason string stamped on any ledger row a merge writes. Re-exported for callers. */
export { PROVISIONAL_MERGE_REASON, isProvisionalSku };
