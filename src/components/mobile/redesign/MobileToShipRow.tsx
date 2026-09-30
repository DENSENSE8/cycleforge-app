'use client';

/** `/m/work` to-ship card — a thin `WorkOrderRow` adapter over the shared {@link ItemCardRow}. */

import { memo } from 'react';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { UNSHIPPED_STATE_META } from '@/lib/unshipped-state';
import { Button } from '@/design-system/primitives';
import type { WorkOrderRow } from '@/components/work-orders/types';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { outboundHandlingFactFaces } from '@/lib/shipping/outbound-handling-facts';
import { getExternalUrlByItemNumber, getPlatformLabelByItemNumber } from '@/hooks/useExternalItemUrl';
import { resolveOutboundWorkflowFacts } from '@/lib/shipping/outbound-workflow-facts';
import { toShipConditionParts, toShipExpectedQty, toShipPriceText } from './to-ship-faces';
import {
  resolveOutboundPriorityAction,
  type OutboundPriorityAction,
  type OutboundTriageActionId,
} from '@/lib/shipping/outbound-workflow-actions';

export const MobileToShipRow = memo(function MobileToShipRow({
  row,
  onOpen,
  now,
  active = false,
  blocked = false,
  onTriage,
  onHold,
  onPriorityAction,
  onPassPick,
  onOpenSheet,
}: {
  row: WorkOrderRow;
  resolveName: (id: number) => string;
  blocked?: boolean;
  onOpen: (row: WorkOrderRow) => void;
  now?: number;
  active?: boolean;
  onTriage: (row: WorkOrderRow, action: OutboundTriageActionId) => void;
  onHold: (row: WorkOrderRow) => void;
  /** Closed priority command shared with the desktop selection plane. */
  onPriorityAction: (row: WorkOrderRow, action: OutboundPriorityAction) => void;
  /** Closed row command: reassign the next physical pick, never an admin-sheet action. */
  onPassPick: (row: WorkOrderRow) => void;
  /** Documentation is explicit secondary work; row tap only selects the task. */
  onOpenSheet: (row: WorkOrderRow) => void;
}) {
  const storagePath = formatOutboundStoragePath(row.storageLocations);
  const quantity = toShipExpectedQty(row);
  const expectedUnits = Number(row.quantity ?? 0);
  const progressTotal = row.allocatedUnitCount && row.allocatedUnitCount > 0
    ? row.allocatedUnitCount
    : Number.isFinite(expectedUnits) && expectedUnits > 0
      ? expectedUnits
      : null;
  const progress = progressTotal != null
    ? `Picked ${row.pickedUnitCount ?? 0}/${progressTotal}`
    : null;
  const orderReference = row.orderId ?? row.recordLabel;
  const listingItemKey = row.itemNumber || row.sku;
  const marketplaceHref = getExternalUrlByItemNumber(listingItemKey);
  const listing = marketplaceHref
    ? {
        href: marketplaceHref,
        platform: row.accountSource?.trim() || getPlatformLabelByItemNumber(listingItemKey),
      }
    : null;
  // Touch has no hover gutter: the urgent word ("Next day") rides the context line.
  const orderContext = [
    row.accountSource?.trim() ? `${row.accountSource.trim()} · ${orderReference}` : `Order · ${orderReference}`,
    row.urgentLabel,
  ].filter(Boolean).join(' · ');
  const workflow = resolveOutboundWorkflowFacts({
    shipmentId: row.shipmentId,
    hasPickScan: row.hasPickScan,
    packedAt: row.packedAt,
    dockStagedAt: row.dockStagedAt,
    isOutOfStock: blocked || row.outOfStock,
    deadlineAt: row.deadlineAt,
  });
  const managementAction = workflow.nextStep.label.replace(/^→\s*/, '');
  const priorityAction = resolveOutboundPriorityAction(Boolean(row.isUrgent));
  const handlingFacts = outboundHandlingFactFaces(row.handlingFacts);
  const managementStatus = UNSHIPPED_STATE_META[workflow.stage].label;
  const managementOwner = workflow.stage === 'PENDING' || workflow.stage === 'AWAITING_LABEL'
    ? row.techName || 'Warehouse'
    : workflow.stage === 'PICKED'
      ? row.packerName || 'Packing'
      : workflow.stage === 'PACKED_STAGED'
        ? 'Shipping'
        : 'Inventory';
  return (
    <ItemCardRow
      title={row.title}
      imageUrl={row.imageUrl}
      orderContext={orderContext}
      reference={row.sku || row.itemNumber || row.orderId}
      listing={listing}
      outboundOrderId={row.entityId}
      qty={quantity}
      price={toShipPriceText(row)}
      quantityStatus={progress}
      managementStatus={managementStatus}
      managementAction={managementAction}
      managementOwner={managementOwner}
      handlingFacts={handlingFacts}

      condition={toShipConditionParts(row)}
      location={{ text: storagePath }}
      deadlineAt={row.deadlineAt}
      now={now}
      onOpen={() => onOpen(row)}
      active={active}
      stateRail={workflow.stateRail}
      ariaLabel={row.title}
      triageActions={[
        { id: 'out_of_stock', label: 'Out of stock', onCommit: () => onTriage(row, 'out_of_stock') },
        { id: 'hold', label: workflow.blocked ? 'Clear hold' : 'Place hold', onCommit: () => onHold(row) },
        { id: 'damaged', label: 'Damaged', onCommit: () => onTriage(row, 'damaged') },
        { id: 'discrepancy', label: 'Discrepancy', onCommit: () => onTriage(row, 'discrepancy') },
      ]}
      footer={active ? (
        <div data-testid="to-ship-row-active-actions" className="flex min-h-11">
          <Button
            variant="secondary"
            size="sm"
            radius="flush"
            className="min-h-11 flex-1 border-r border-border-hairline"
            onClick={() => onPassPick(row)}
          >
            Pass pick
          </Button>
          <Button
            variant="ghost"
            size="sm"
            radius="flush"
            className="min-h-11 flex-1 border-r border-border-hairline"
            onClick={() => onOpenSheet(row)}
          >
            Details
          </Button>
          <Button
            variant={row.isUrgent ? 'warning' : 'secondary'}
            size="sm"
            radius="flush"
            className="min-h-11 flex-1"
            onClick={() => onPriorityAction(row, priorityAction)}
          >
            {priorityAction.label}
          </Button>
        </div>
      ) : null}
    />
  );
});
