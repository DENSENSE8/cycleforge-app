/**
 * Carton receiving lines → {@link ItemRecord}.
 *
 * Pure mapper for the search receiving centre when no marketplace order is
 * linked. Each line becomes one ledger row with got/listed counts. A missing
 * received count is got 0, never listed-as-got.
 */

import { receivingLineContentsTitle } from '@/components/receiving/contents/receiving-line-contents-title';
import type { CartonInspectorLine } from '@/components/receiving/inspector/carton-inspector-model';
import type { ItemRecord } from '@/design-system/components/item-record';
import { receivingQty } from '@/lib/item-record/receiving-qty';

export function receivingLinesToItemRecords(
  lines: ReadonlyArray<CartonInspectorLine>,
): ItemRecord[] {
  return lines.map((line) => {
    const sku = String(line.sku ?? '').trim();
    const title = receivingLineContentsTitle({
      zoho_item_title: line.zoho_item_title,
      catalog_product_title: line.catalog_product_title,
      item_name: line.item_name,
      sku: line.sku,
    });
    return {
      id: line.id,
      title,
      sku: sku || null,
      quantity: receivingQty(line),
      conditionGrade: String(line.condition_grade ?? '').trim() || null,
      serials: (line.serials ?? [])
        .map((s) => String(s.serial_number ?? '').trim())
        .filter(Boolean),
      unitPrice: null,
      imageUrl: line.image_url?.trim() || null,
    };
  });
}
