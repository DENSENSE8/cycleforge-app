import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { formatDateTimePST } from '@/utils/date';

export function displayReceivingProductTitle(row: ReceivingLineRow): string {
  return (
    row.catalog_product_title ||
    row.zoho_item_title ||
    row.item_name ||
    row.zoho_item_id ||
    'Unnamed inbound line'
  );
}

export function receivingStageTooltip(
  row: ReceivingLineRow,
  stamp: NonNullable<ReturnType<typeof resolveReceivingRowStageStamp>>,
  axis: ReceivingActivityAxis,
): string {
  const primaryAbs = formatDateTimePST(stamp.instant);
  const parts = [
    stamp.staffName ? `${stamp.label} ${primaryAbs} by ${stamp.staffName}` : `${stamp.label} ${primaryAbs}`,
  ];
  if (axis === 'unboxed') {
    const scanInstant = (row.scanned_at || row.received_at || '').trim();
    if (scanInstant) {
      const scanAbs = formatDateTimePST(scanInstant);
      const by =
        (row.scanned_by_name || '').trim() ||
        (row.received_by_name || '').trim() ||
        '';
      parts.push(by ? `Scanned ${scanAbs} by ${by}` : `Scanned ${scanAbs}`);
    }
  } else if (axis === 'scanned') {
    const unboxed = (row.unboxed_at || '').trim();
    if (unboxed) {
      const abs = formatDateTimePST(unboxed);
      const by = (row.unboxed_by_name || '').trim();
      parts.push(by ? `Unboxed ${abs} by ${by}` : `Unboxed ${abs}`);
    }
  }
  return parts.join(' · ');
}
