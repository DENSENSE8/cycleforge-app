/**
 * Parcel dims remembered per SKU / item number (`product_parcel_dims`,
 * migration 2026-09-24g).
 *
 * The order's own parcel (`orders.parcel_*`) stays the source of truth for
 * that order. When it is EMPTY, the reader falls back to what the product
 * remembers — SKU first (the internal catalog key), then item number (the
 * marketplace listing id) — and says which answered, so the form can show
 * "Remembered from SKU 03796" instead of passing a guess off as a measurement.
 *
 * One normalization, two languages: {@link normalizeSkuKey} /
 * {@link normalizeItemKey} for the writer, {@link skuKeySql} /
 * {@link itemKeySql} for the SQL readers. They must agree — the test pins it.
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeIdentifier } from '@/lib/product-manuals';

export type ParcelSource = 'order' | 'sku' | 'item_number';

export interface ParcelValues {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export interface ResolvedParcel extends ParcelValues {
  /** Which record answered; `null` when none holds any value. */
  source: ParcelSource | null;
  /** The key that answered (`03796`, `B0CXYZ…`) when source is sku / item_number. */
  sourceKey: string | null;
}

/** `orders.sku` → key: `UPPER(TRIM(sku))`, empty → null. */
export function normalizeSkuKey(raw: string | null | undefined): string | null {
  const key = String(raw ?? '').trim().toUpperCase();
  return key || null;
}

/** `orders.item_number` → key: the manuals' identifier normalization, empty → null. */
export function normalizeItemKey(raw: string | null | undefined): string | null {
  const key = normalizeIdentifier(String(raw ?? ''));
  return key || null;
}

/** SQL twin of {@link normalizeSkuKey}. */
export function skuKeySql(column: string): string {
  return `NULLIF(UPPER(TRIM(${column})), '')`;
}

/** SQL twin of {@link normalizeItemKey} (upper → strip non-alphanumerics → strip leading zeros). */
export function itemKeySql(column: string): string {
  return `NULLIF(LTRIM(REGEXP_REPLACE(UPPER(COALESCE(${column}, '')), '[^A-Z0-9]', '', 'g'), '0'), '')`;
}

/**
 * The two remembered rows for an order, joined by its normalized keys. Use with
 * {@link PARCEL_FALLBACK_SELECT_SQL}; `alias` is the orders alias in the query.
 */
export function parcelFallbackJoinSql(alias: string): string {
  return `
  LEFT JOIN product_parcel_dims ppd_sku
         ON ppd_sku.organization_id = ${alias}.organization_id
        AND ppd_sku.key_kind = 'sku'
        AND ppd_sku.key_value = ${skuKeySql(`${alias}.sku`)}
  LEFT JOIN product_parcel_dims ppd_item
         ON ppd_item.organization_id = ${alias}.organization_id
        AND ppd_item.key_kind = 'item_number'
        AND ppd_item.key_value = ${itemKeySql(`${alias}.item_number`)}`;
}

export const PARCEL_FALLBACK_SELECT_SQL = `
    ppd_sku.key_value   AS sku_parcel_key,
    ppd_sku.weight_oz   AS sku_parcel_weight_oz,
    ppd_sku.length_in   AS sku_parcel_length_in,
    ppd_sku.width_in    AS sku_parcel_width_in,
    ppd_sku.height_in   AS sku_parcel_height_in,
    ppd_item.key_value  AS item_parcel_key,
    ppd_item.weight_oz  AS item_parcel_weight_oz,
    ppd_item.length_in  AS item_parcel_length_in,
    ppd_item.width_in   AS item_parcel_width_in,
    ppd_item.height_in  AS item_parcel_height_in`;

type Num = string | number | null | undefined;

/** The columns {@link PARCEL_FALLBACK_SELECT_SQL} adds to a row. */
export interface ParcelFallbackColumns {
  sku_parcel_key?: string | null;
  sku_parcel_weight_oz?: Num;
  sku_parcel_length_in?: Num;
  sku_parcel_width_in?: Num;
  sku_parcel_height_in?: Num;
  item_parcel_key?: string | null;
  item_parcel_weight_oz?: Num;
  item_parcel_length_in?: Num;
  item_parcel_width_in?: Num;
  item_parcel_height_in?: Num;
}

/** pg returns `numeric` as text — a positive number or null. */
export function positiveOrNull(value: Num): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function anyValue(p: ParcelValues): boolean {
  return p.weightOz != null || p.lengthIn != null || p.widthIn != null || p.heightIn != null;
}

/**
 * Order → SKU → item number. A record answers WHOLE (never a weight from one
 * and a box from another): the first one holding any value wins.
 */
export function resolveParcelWithSource(order: ParcelValues, row: ParcelFallbackColumns): ResolvedParcel {
  if (anyValue(order)) return { ...order, source: 'order', sourceKey: null };
  const sku: ParcelValues = {
    weightOz: positiveOrNull(row.sku_parcel_weight_oz),
    lengthIn: positiveOrNull(row.sku_parcel_length_in),
    widthIn: positiveOrNull(row.sku_parcel_width_in),
    heightIn: positiveOrNull(row.sku_parcel_height_in),
  };
  if (anyValue(sku)) return { ...sku, source: 'sku', sourceKey: row.sku_parcel_key ?? null };
  const item: ParcelValues = {
    weightOz: positiveOrNull(row.item_parcel_weight_oz),
    lengthIn: positiveOrNull(row.item_parcel_length_in),
    widthIn: positiveOrNull(row.item_parcel_width_in),
    heightIn: positiveOrNull(row.item_parcel_height_in),
  };
  if (anyValue(item)) return { ...item, source: 'item_number', sourceKey: row.item_parcel_key ?? null };
  return { ...order, source: null, sourceKey: null };
}

/** The rows {@link rememberParcelDims} writes for an order (pure — tested). */
export function parcelDimsKeysFor(order: {
  sku: string | null | undefined;
  itemNumber: string | null | undefined;
}): Array<{ kind: 'sku' | 'item_number'; value: string }> {
  const keys: Array<{ kind: 'sku' | 'item_number'; value: string }> = [];
  const sku = normalizeSkuKey(order.sku);
  if (sku) keys.push({ kind: 'sku', value: sku });
  const item = normalizeItemKey(order.itemNumber);
  if (item) keys.push({ kind: 'item_number', value: item });
  return keys;
}

/**
 * Remember an order's parcel on its SKU and item number, inside the caller's
 * tenant transaction. Only entered values overwrite — a field the operator
 * left empty keeps what the product already remembers. No-op when nothing was
 * entered or the order has no key.
 */
export async function rememberParcelDims(
  client: Pick<PoolClient, 'query'>,
  input: {
    orgId: OrgId;
    orderId: number;
    sku: string | null;
    itemNumber: string | null;
    skuCatalogId: number | null;
    parcel: ParcelValues;
    staffId: number | null;
  },
): Promise<number> {
  if (!anyValue(input.parcel)) return 0;
  const keys = parcelDimsKeysFor({ sku: input.sku, itemNumber: input.itemNumber });
  for (const key of keys) {
    await client.query(
      `INSERT INTO product_parcel_dims
         (organization_id, key_kind, key_value, sku_catalog_id,
          weight_oz, length_in, width_in, height_in, source_order_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id, key_kind, key_value) DO UPDATE
          SET weight_oz       = COALESCE(EXCLUDED.weight_oz, product_parcel_dims.weight_oz),
              length_in       = COALESCE(EXCLUDED.length_in, product_parcel_dims.length_in),
              width_in        = COALESCE(EXCLUDED.width_in, product_parcel_dims.width_in),
              height_in       = COALESCE(EXCLUDED.height_in, product_parcel_dims.height_in),
              sku_catalog_id  = COALESCE(EXCLUDED.sku_catalog_id, product_parcel_dims.sku_catalog_id),
              source_order_id = EXCLUDED.source_order_id,
              updated_by      = EXCLUDED.updated_by,
              updated_at      = now()`,
      [
        input.orgId,
        key.kind,
        key.value,
        input.skuCatalogId,
        input.parcel.weightOz,
        input.parcel.lengthIn,
        input.parcel.widthIn,
        input.parcel.heightIn,
        input.orderId,
        input.staffId,
      ],
    );
  }
  return keys.length;
}
