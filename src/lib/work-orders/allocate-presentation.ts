import type { WorkOrderRow } from '@/components/work-orders/types';
import { conditionGradeTableLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';
import { allocateSlaLabel } from '@/lib/mobile/allocate-list-state';
import { resolveOutboundWorkflowFacts } from '@/lib/shipping/outbound-workflow-facts';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { UNSHIPPED_STATE_META } from '@/lib/unshipped-state';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';
import { getExternalUrlByItemNumber, getPlatformLabelByItemNumber } from '@/utils/external-item-url';
import { mobileProcessOrderHref, toShipOrderId } from './to-ship-assignment';

export type AllocatePresentation = ReturnType<typeof resolveAllocatePresentation>;

/**
 * One React-free projection for both the high-volume row and its detail sheet.
 * The two surfaces can disclose different amounts without re-deriving facts.
 */
export function resolveAllocatePresentation(row: WorkOrderRow, nowMs: number) {
  const workflow = resolveOutboundWorkflowFacts({
    shipmentId: row.shipmentId,
    fulfillmentChannel: row.fulfillmentChannel,
    hasPickScan: row.hasPickScan,
    packedAt: row.packedAt,
    dockStagedAt: row.dockStagedAt,
    isOutOfStock: row.outOfStock,
    deadlineAt: row.deadlineAt,
  });
  const state = UNSHIPPED_STATE_META[workflow.stage];
  const location = formatOutboundStoragePath(row.storageLocations) || null;
  const qtyNumber = Number.parseInt(String(row.quantity ?? ''), 10);
  const quantity = Number.isFinite(qtyNumber) && qtyNumber > 0 ? qtyNumber : null;
  const condition = conditionGradeTableLabel(row.condition);
  const price = formatSalePrice(row.saleAmount, row.currency) || EMPTY_META_DASH;
  const due = row.deadlineAt ? formatDateKeyShort(toPSTDateKey(row.deadlineAt)) : null;
  const slaFallback = workflow.deadlineBand === 'overdue'
    ? due ? `Late ${due}` : 'Late'
    : workflow.deadlineBand === 'today'
      ? 'Due today'
      : due ? `Due ${due}` : 'No SLA';
  const processHref = mobileProcessOrderHref(row);
  const fullRecordHref = `/m/orders/${row.entityId}`;
  const primary = workflow.blocked
    ? { label: 'Resolve shortage', href: fullRecordHref }
    : workflow.stage === 'PICKED'
      ? { label: 'Continue to pack', href: fullRecordHref }
      : workflow.stage === 'PACKED_STAGED'
        ? { label: workflow.nextStep.label, href: fullRecordHref }
        : { label: location ? 'Start pick' : 'Scan and assign', href: processHref };

  return {
    workflow,
    state,
    orderReference: toShipOrderId(row),
    quantity,
    quantityDisplay: quantity == null ? EMPTY_META_DASH : quantity > 1 ? `×${quantity}` : String(quantity),
    quantityTone: orderRowQtyTone(quantity ?? 0),
    condition,
    conditionTone: conditionGradeTextClass(row.condition),
    price,
    location,
    sla: allocateSlaLabel(row.deadlineAt, slaFallback, nowMs),
    listingPlatform: getPlatformLabelByItemNumber(row.itemNumber),
    listingUrl: getExternalUrlByItemNumber(row.itemNumber),
    processHref,
    fullRecordHref,
    primary,
    picker: row.techName?.trim() || null,
    packer: row.packerName?.trim() || null,
    available: row.stockLevel == null ? null : Number(row.stockLevel),
    allocated: row.allocatedUnitCount == null ? null : Number(row.allocatedUnitCount),
    picked: row.pickedUnitCount == null ? null : Number(row.pickedUnitCount),
  };
}
