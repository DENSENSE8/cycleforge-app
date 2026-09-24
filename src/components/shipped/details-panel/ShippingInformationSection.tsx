'use client';

import { useEffect, useState } from 'react';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { getOrderIdUrl } from '@/utils/order-links';
import { formatDateTimePST } from '@/utils/date';
import { Zap } from '@/components/Icons';
import { DetailsPanelRow } from '@/design-system/components/DetailsPanelRow';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { TrackingNumberRow } from '@/components/ui/TrackingNumberRow';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { StnTicketLinkModal } from '@/components/support/link/StnTicketLinkModal';
import { useOrderChannel, usePlatformMeta } from '@/hooks/useCatalog';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

import {
  canEditShippingInfo,
  isExceptionShippedRow,
} from '@/components/shipped/details-panel/shipped-details-logic';
import { SerialNumbersRow } from './SerialNumbersRow';
import { buildAllTrackingRows, serialNumberRowsFromShipped, deriveShippingDisplayMeta } from './shipping-information/helpers';
import { ShippingEditableRow } from './shipping-information/ShippingEditableRow';
import { PrepackedSkuRow } from './shipping-information/PrepackedSkuRow';
import { useEditableShippingFields } from './shipping-information/hooks/useEditableShippingFields';
import { useInlineTrackingDrafts } from './shipping-information/hooks/useInlineTrackingDrafts';
import type {
  EditableShippingFields,
  PrepackedSkuInfo,
} from './shipping-information/types';

// Re-export the public API so existing consumers keep importing from this path.
export type { EditableShippingFields, PrepackedSkuInfo };

interface ShippingInformationSectionProps {
  shipped: ShippedOrder;
  onUpdate?: () => void;
  showSerialNumber?: boolean;
  showShippingTimestamp?: boolean;
  editableShippingFields?: EditableShippingFields;
  prepackedSku?: PrepackedSkuInfo | null;
  /**
   * One-shot auto-start for the primary tracking row's replace editor (queue
   * "Replace tracking" → inspector). Passed through to the first
   * {@link TrackingNumberRow} only.
   */
  replaceTrackingNonce?: number;
}

export function ShippingInformationSection({
  shipped,
  onUpdate,
  showSerialNumber = true,
  showShippingTimestamp = false,
  editableShippingFields,
  prepackedSku,
  replaceTrackingNonce = 0,
}: ShippingInformationSectionProps) {
  const resolveOrderChannel = useOrderChannel();
  const resolvePlatformMeta = usePlatformMeta();
  const channelLabel = resolveOrderChannel(shipped.order_id, shipped.account_source).label;
  const fromLabel = sourcePlatformMetaFromLabel(channelLabel);
  const platformMeta = fromLabel.value ? resolvePlatformMeta(fromLabel.value) : fromLabel;

  const { ef, internalFieldSave } = useEditableShippingFields(shipped, editableShippingFields, onUpdate);

  const allTrackingRows = buildAllTrackingRows(shipped, editableShippingFields);
  const serialNumberRows = serialNumberRowsFromShipped(shipped);

  const { linkedTrackingDrafts, setLinkedTrackingDrafts, saveLinkedTracking } = useInlineTrackingDrafts(
    shipped,
    allTrackingRows,
    onUpdate,
  );

  const {
    daysLate,
    packedAtSource,
  } = deriveShippingDisplayMeta(shipped, serialNumberRows);
  const daysLateTone = daysLate > 1 ? 'danger' : daysLate === 1 ? 'warning' : 'soft';
  const shippingEditable = canEditShippingInfo(shipped);

  // Operator urgent / expedited flag (orders.is_urgent) — toggled inline on the
  // Ship By Date row (urgency is a deadline concern). Optimistic draft clears
  // when the record changes; the mutation patches the shared order caches.
  const assignOrder = useOrderAssignment();
  const orderRowId = typeof shipped.id === 'number' ? shipped.id : Number(shipped.id);
  // Urgent lives on `orders.is_urgent` — never toggle against an exception id.
  const canToggleUrgent =
    Number.isFinite(orderRowId) && orderRowId > 0 && !isExceptionShippedRow(shipped);
  const [urgentDraft, setUrgentDraft] = useState<boolean | null>(null);
  /**
   * The STN whose "Link ticket" modal is open, or null. Ephemeral — a link is an
   * act-and-clear side action on the shipment, not a durable selection, so it
   * stays out of the URL (that would be a second selection competing with the
   * panel's own `?id=`).
   */
  const [ticketLinkShipment, setTicketLinkShipment] = useState<
    { shipmentId: number; tracking: string | null } | null
  >(null);
  useEffect(() => { setUrgentDraft(null); }, [shipped.id]);
  const isUrgent = urgentDraft ?? Boolean((shipped as { is_urgent?: boolean }).is_urgent);
  const toggleUrgent = () => {
    if (!canToggleUrgent) return;
    const next = !isUrgent;
    setUrgentDraft(next);
    assignOrder.mutate(
      { orderId: orderRowId, isUrgent: next },
      { onError: () => setUrgentDraft(null), onSuccess: () => onUpdate?.() },
    );
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-text-default">Order details</h3>

      <div className="space-y-0">
        <ShippingEditableRow
          label="Ship By Date"
          headerAccessory={
            <span className="flex items-center gap-2">
              <LedgerValue value={daysLate} variant="number" tier="meta" tone={daysLateTone} />
              <HoverTooltip label={isUrgent ? 'Clear urgent flag' : 'Mark as urgent'} asChild>
                {/* ds-raw-button: inline urgent/expedited toggle pill — icon + optional label, which IconButton (icon-only) can't express */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleUrgent(); }}
                  disabled={!canToggleUrgent}
                  aria-pressed={isUrgent}
                  aria-label={isUrgent ? 'Clear urgent flag' : 'Mark as urgent'}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 text-role-micro leading-none transition-colors disabled:opacity-40',
                    cornerClass('flush'),
                    isUrgent
                      ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                      : 'text-text-faint hover:bg-surface-sunken hover:text-amber-600',
                  )}
                >
                  <Zap className={cn('h-3 w-3 shrink-0', isUrgent && 'fill-current')} />
                  {isUrgent ? 'Urgent' : null}
                </button>
              </HoverTooltip>
            </span>
          }
          value={ef.shipByDate}
          placeholder="MM-DD-YY"
          onChange={ef.onShipByDateChange}
          onBlur={ef.onShipByDateBlur}
          allowEdit={shippingEditable}
        />

        {showShippingTimestamp ? (
          <DetailsPanelRow label="Shipped">
            <p className="text-sm font-semibold text-text-default">
              {packedAtSource ? formatDateTimePST(packedAtSource) : '—'}
            </p>
          </DetailsPanelRow>
        ) : null}

        <ShippingEditableRow
          label="Order ID"
          value={ef.orderNumber}
          placeholder="Enter order ID"
          onChange={ef.onOrderNumberChange}
          onBlur={ef.onBlur}
          externalUrl={getOrderIdUrl(ef.orderNumber)}
          headerAccessory={
            platformMeta.value ? (
              <HoverTooltip label={platformMeta.label} asChild focusable={false}>
                <span className="inline-flex shrink-0" aria-label={platformMeta.label}>
                  <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
                </span>
              </HoverTooltip>
            ) : null
          }
          allowEdit={shippingEditable}
        />

        {allTrackingRows.length > 0 ? allTrackingRows.map((row, index) => {
          const draftKey = `${row.shipmentId ?? 'none'}:${index}`;
          const draftValue = linkedTrackingDrafts[draftKey] ?? row.tracking;
          return (
            <TrackingNumberRow
              key={`tracking-${index}-${row.shipmentId ?? 'none'}`}
              label={`Tracking Number${allTrackingRows.length > 1 ? ` ${index + 1}` : ''}`}
              value={draftValue}
              carrierHint={shipped.carrier}
              placeholder="Enter tracking number"
              replaceNonce={index === 0 ? replaceTrackingNonce : 0}
              // Per-STN, not per-order: each tracking number links to its own
              // ticket(s). Needs a real shipment id — a tracking number typed but
              // not yet registered has no STN row to anchor to.
              headerAccessory={
                row.shipmentId ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTicketLinkShipment({
                        shipmentId: row.shipmentId as number,
                        tracking: draftValue || null,
                      })
                    }
                    className="ds-raw-button text-role-eyebrow text-text-info hover:underline"
                  >
                    Link ticket
                  </button>
                ) : undefined
              }
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
        }) : (
          <TrackingNumberRow label="Tracking Number" value="" placeholder="No tracking number" />
        )}

        {showSerialNumber ? (
          <SerialNumbersRow serials={serialNumberRows} />
        ) : null}

        {prepackedSku ? <PrepackedSkuRow sku={prepackedSku} /> : null}

        {ef.isSaving ? (
          <p className="pt-2 text-role-micro text-text-info">Saving shipping updates...</p>
        ) : null}
        {ef.isSavingShipByDate ? (
          <p className="pt-1 text-role-micro text-text-info">Saving ship by date...</p>
        ) : null}
      </div>

      {/* Mounted only while open so the picker's search effect doesn't run for
          every shipment the operator scrolls past. */}
      {ticketLinkShipment ? (
        <StnTicketLinkModal
          open
          onClose={() => setTicketLinkShipment(null)}
          shipmentId={ticketLinkShipment.shipmentId}
          trackingNumber={ticketLinkShipment.tracking}
        />
      ) : null}
    </section>
  );
}
