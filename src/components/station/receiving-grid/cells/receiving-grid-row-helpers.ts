import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { receivingUnboxedSyncTooltip } from '@/lib/receiving/unboxed-sync-tooltip';
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

/**
 * History-mode status-chip tooltip.
 *
 * - **Fine** (Testing History): DONE (Received) is bare; UNBOXED uses the shared
 *   sync tip SoT; other stages keep the stage tip.
 * - **Coarse** (Unbox / Receiving History): Received (incl. testing terminals) is
 *   bare; UNBOXED keeps the sync tip; never surface stage tips that name FAILED /
 *   AWAITING_TEST / etc.
 */
export function receivingHistoryStatusTooltip({
  workflowStatus,
  inventoryProviderLabel,
  stageTip,
  statusVocabulary = 'fine',
}: {
  workflowStatus: string | null | undefined;
  inventoryProviderLabel: string;
  stageTip?: string | null;
  statusVocabulary?: 'fine' | 'coarse';
}): string | null {
  const syncTip = receivingUnboxedSyncTooltip({ workflowStatus, inventoryProviderLabel });
  if (statusVocabulary === 'coarse') {
    return syncTip;
  }
  const s = String(workflowStatus ?? '').trim().toUpperCase();
  if (s === 'DONE') return null;
  if (syncTip) return syncTip;
  const tip = String(stageTip ?? '').trim();
  return tip || null;
}
