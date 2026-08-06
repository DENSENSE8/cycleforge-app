'use client';

/**
 * OrderFulfillmentFacts — compact Fulfillment card for the order record.
 *
 * Tracking · ship-by · serial already on Item when present · carrier/status/
 * dates. Deliberately omits Order ID (identity band owns it) and the urgent
 * Zap toggle (header actions + exception banner own that flag).
 */

import { Check, Copy, Pencil } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TrackingNumberRow } from '@/components/ui/TrackingNumberRow';
import { IconButton } from '@/design-system/primitives';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { canEditShippingInfo } from '@/components/shipped/details-panel/shipped-details-logic';
import {
  buildAllTrackingRows,
  deriveShippingDisplayMeta,
  serialNumberRowsFromShipped,
} from '@/components/shipped/details-panel/shipping-information/helpers';
import { useEditableShippingFields } from '@/components/shipped/details-panel/shipping-information/hooks/useEditableShippingFields';
import { useInlineTrackingDrafts } from '@/components/shipped/details-panel/shipping-information/hooks/useInlineTrackingDrafts';
import { useShippingInfoEditModal } from '@/components/shipped/details-panel/shipping-information/hooks/useShippingInfoEditModal';
import { ShippingInfoEditModal } from '@/components/shipped/details-panel/shipping-information/ShippingInfoEditModal';
import type { EditableShippingFields } from '@/components/shipped/details-panel/shipping-information/types';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';

export function OrderFulfillmentFacts({
  order,
  copiedAll,
  onCopyAll,
  onUpdate,
  editableShippingFields,
}: {
  order: ShippedOrder;
  copiedAll?: boolean;
  onCopyAll?: () => void;
  onUpdate?: () => void;
  editableShippingFields?: EditableShippingFields;
}) {
  const { ef, internalFieldSave } = useEditableShippingFields(order, editableShippingFields, onUpdate);
  const allTrackingRows = buildAllTrackingRows(order, editableShippingFields);
  const serialNumberRows = serialNumberRowsFromShipped(order);
  const { linkedTrackingDrafts, setLinkedTrackingDrafts, saveLinkedTracking } = useInlineTrackingDrafts(
    order,
    allTrackingRows,
    onUpdate,
  );
  const modal = useShippingInfoEditModal({
    shipped: order,
    ef,
    allTrackingRows,
    serialNumberRows,
    internalFieldSave,
    onUpdate,
    setLinkedTrackingDrafts,
  });
  const { daysLate } = deriveShippingDisplayMeta(order, serialNumberRows);
  const daysLateTone = daysLate > 1 ? 'danger' : daysLate === 1 ? 'warning' : 'soft';
  const shippingEditable = canEditShippingInfo(order);

  const created = order.created_at ? formatDateTimePST(order.created_at) : '';
  const packedAt = order.packed_at ? formatDateTimePST(order.packed_at) : '';
  const latestEvent = order.latest_event_at ? formatDateTimePST(order.latest_event_at) : '';
  const shipConfirmed = order.ship_confirmed_at ? formatDateTimePST(order.ship_confirmed_at) : '';

  // Ship-by display: prefer the editable draft string when provided.
  const shipByDisplay = String(ef.shipByDate || '').trim()
    || (order.ship_by_date ? formatDateTimePST(order.ship_by_date) : '');

  return (
    <div className="stack-tight">
      <ShippingInfoEditModal
        open={modal.isOpen}
        draft={modal.draft}
        setDraft={modal.setDraft}
        isSaving={modal.isSaving}
        isSaveSuccess={modal.isSaveSuccess}
        error={modal.error}
        exceptionMode={modal.exceptionMode}
        onClose={modal.requestClose}
        onSave={() => {
          void modal.handleModalSave();
        }}
      />

      <div className="flex items-center justify-end gap-1">
        {onCopyAll ? (
          <HoverTooltip label="Copy all order details" asChild>
            <IconButton
              onClick={onCopyAll}
              ariaLabel="Copy all order details"
              icon={copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-sunken ${
                copiedAll ? 'text-text-success' : 'text-text-faint hover:text-text-muted'
              }`}
            />
          </HoverTooltip>
        ) : null}
        {shippingEditable ? (
          <HoverTooltip label="Edit shipping information" asChild>
            <IconButton
              onClick={modal.openEditModal}
              ariaLabel="Edit shipping information"
              icon={<Pencil className="h-3.5 w-3.5" />}
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-faint hover:bg-surface-sunken hover:text-text-muted"
            />
          </HoverTooltip>
        ) : null}
      </div>

      <OrderFactList>
        <OrderFactRow
          label="Ship by"
          omitWhenEmpty
          value={
            shipByDisplay ? (
              <span className="inline-flex items-center gap-2">
                <span>{shipByDisplay}</span>
                {daysLate > 0 ? (
                  <LedgerValue
                    value={daysLate}
                    variant="number"
                    tier="meta"
                    tone={daysLateTone}
                    className="uppercase tracking-wide"
                  />
                ) : null}
              </span>
            ) : null
          }
        />
      </OrderFactList>

      <div className="space-y-0">
        {allTrackingRows.length > 0 ? (
          allTrackingRows.map((row, index) => {
            const draftKey = `${row.shipmentId ?? 'none'}:${index}`;
            const draftValue = linkedTrackingDrafts[draftKey] ?? row.tracking;
            return (
              <TrackingNumberRow
                key={`tracking-${index}-${row.shipmentId ?? 'none'}`}
                label={`Tracking${allTrackingRows.length > 1 ? ` ${index + 1}` : ''}`}
                value={draftValue}
                carrierHint={order.carrier}
                placeholder="Enter tracking number"
                onReplace={async (next) => {
                  const trimmed = String(next || '').trim();
                  if (!trimmed) return;
                  setLinkedTrackingDrafts((prev) => ({ ...prev, [draftKey]: trimmed }));
                  if (index === 0) {
                    ef.onTrackingNumberChange(trimmed);
                    await internalFieldSave.saveInlineFields(ef.orderNumber, ef.itemNumber, trimmed);
                  } else {
                    await saveLinkedTracking(row.shipmentId, trimmed);
                  }
                }}
              />
            );
          })
        ) : (
          <TrackingNumberRow label="Tracking" value="" placeholder="No tracking number" />
        )}
      </div>

      <OrderFactList>
        <OrderFactRow label="Carrier" value={order.carrier} omitWhenEmpty />
        <OrderFactRow label="Shipment status" value={order.shipment_status} omitWhenEmpty />
        <OrderFactRow label="Latest status" value={order.latest_status_label} omitWhenEmpty />
        <OrderFactRow label="Latest event" value={latestEvent} omitWhenEmpty />
        <OrderFactRow label="Ship confirmed" value={shipConfirmed} omitWhenEmpty />
        <OrderFactRow label="Created" value={created} omitWhenEmpty />
        <OrderFactRow label="Packed at" value={packedAt} omitWhenEmpty />
        <OrderFactRow label="Packed by" value={order.packed_by_name} omitWhenEmpty />
        {order.tracking_type ? (
          <OrderFactRow label="Type" value={order.tracking_type} omitWhenEmpty />
        ) : null}
      </OrderFactList>

      {ef.isSaving ? (
        <p className="text-role-micro uppercase tracking-wide text-text-info">Saving shipping updates…</p>
      ) : null}
      {ef.isSavingShipByDate ? (
        <p className="text-role-micro uppercase tracking-wide text-text-info">Saving ship by date…</p>
      ) : null}
    </div>
  );
}
