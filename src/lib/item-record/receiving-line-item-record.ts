/**
 * Carton receiving lines → {@link ItemRecord}.
 *
 * Pure mapper for the search receiving centre when no marketplace order is
 * linked. Each line becomes one ledger row with expected/received counts.
 */

import { receivingLineContentsTitle } from '@/components/receiving/contents/receiving-line-contents-title';
import type { CartonInspectorLine } from '@/components/receiving/inspector/carton-inspector-model';
import type { ItemRecord } from '@/design-system/components/item-record';

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
    const expected =
      typeof line.quantity_expected === 'number' ? line.quantity_expected : null;
    const received =
      typeof line.quantity_received === 'number' ? line.quantity_received : null;

    return {
      id: line.id,
      title,
      sku: sku || null,
      quantity: {
        expected: expected != null && expected > 0 ? expected : null,
        counted: received != null && received >= 0 ? received : null,
      },
      conditionGrade: String(line.condition_grade ?? '').trim() || null,
      serials: (line.serials ?? [])
        .map((s) => String(s.serial_number ?? '').trim())
        .filter(Boolean),
      unitPrice: null,
      imageUrl: line.image_url?.trim() || null,
    };
  });
}
