/**
 * `sku-exceptions` slot resolver — `(ProvisionalSku, fieldId) → CompoundSlotValue`.
 *
 * Pure. The ONE source for the search index and the sort comparator, and the
 * home of the derived state word ({@link skuExceptionState}) so the adapter
 * and the editor paint the same strings the columns sort by.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

/** `Needs photo` is the one a desk acts on: pairing is guesswork without one. */
export type SkuExceptionState = 'Needs photo' | 'On hold';

export function skuExceptionState(row: Pick<ProvisionalSku, 'photoCount'>): SkuExceptionState {
  return row.photoCount > 0 ? 'On hold' : 'Needs photo';
}

/** `C-04-09-2-00 ×3 · B-01-02-1-00 ×1` — every location holding stock. */
export function skuExceptionLocationsLabel(row: Pick<ProvisionalSku, 'locations'>): string | null {
  const parts = row.locations
    .filter((loc) => loc.qty !== 0)
    .map((loc) => `${skuExceptionLocationFace(loc.barcode)} ×${loc.qty}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The item cell's title: the typed name, else the placeholder SKU. */
export function skuExceptionTitle(row: Pick<ProvisionalSku, 'productTitle' | 'sku'>): string {
  return str(row.productTitle) ?? row.sku;
}

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveSkuExceptionsSlotValue(
  row: ProvisionalSku,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'sku-exceptions.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'sku-exceptions.barcode':
      return { kind: 'value', text: str(row.barcode) };
    case 'sku-exceptions.title':
      return { kind: 'value', text: skuExceptionTitle(row) };
    case 'sku-exceptions.description':
      return { kind: 'value', text: str(row.description) };
    case 'sku-exceptions.on_hand':
      return { kind: 'value', text: String(row.stock) };
    case 'sku-exceptions.locations':
      return { kind: 'value', text: skuExceptionLocationsLabel(row) };
    case 'sku-exceptions.photos':
      return { kind: 'value', text: String(row.photoCount) };
    case 'sku-exceptions.created_by':
      return { kind: 'person', staffId: row.createdByStaffId, name: str(row.createdByName) };
    case 'sku-exceptions.state':
      return { kind: 'value', text: skuExceptionState(row) };
    case 'sku-exceptions.created_at':
      return { kind: 'value', text: str(row.createdAt) };
    default:
      return null;
  }
}
