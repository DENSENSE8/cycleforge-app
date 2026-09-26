/** Per-SKU bin slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SkuBinTableRow } from '@/lib/inventory/sku-bin-row';

/** The per-SKU stock level of one bin, as the `bins` overview already words it. */
export type SkuBinLevel = 'Empty' | 'Low' | 'Over' | 'Stocked';

export function skuBinLevel(row: SkuBinTableRow): SkuBinLevel {
  if (row.qty <= 0) return 'Empty';
  if (row.min_qty != null && row.qty < row.min_qty) return 'Low';
  if (row.max_qty != null && row.qty > row.max_qty) return 'Over';
  return 'Stocked';
}

/** The bin's own handle — the coalesce the retired identity cell printed. */
export function skuBinLabel(row: SkuBinTableRow): string {
  return str(row.bin_name) ?? str(row.bin_barcode) ?? `#${row.location_id}`;
}

/** What the item cell says this row is about: the catalog title, else the SKU. */
export function skuBinItemLabel(row: SkuBinTableRow): string | null {
  return str(row.product_title) ?? str(row.sku);
}

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** A number fact, or `null` when the column is unset (never `"null"`). */
function num(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

export function resolveSkuBinsSlotValue(
  row: SkuBinTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'sku-bins.bin':
      return { kind: 'value', text: skuBinLabel(row) };
    case 'sku-bins.item':
      return { kind: 'value', text: skuBinItemLabel(row) };
    case 'sku-bins.qty':
      return { kind: 'value', text: num(row.qty) };
    case 'sku-bins.min_qty':
      return { kind: 'value', text: num(row.min_qty) };
    case 'sku-bins.max_qty':
      return { kind: 'value', text: num(row.max_qty) };
    case 'sku-bins.level':
      return { kind: 'value', text: skuBinLevel(row) };
    case 'sku-bins.last_counted':
      return { kind: 'value', text: str(row.last_counted) };
    default:
      return null;
  }
}
