'use client';

/** The Fulfilled package adapter: one shipment read, one shared record slot. */

import { useMemo, useState, type ReactNode } from 'react';
import { Copy, ExternalLink, PackageCheck, Truck } from '@/components/Icons';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import type { RecordModel, RecordVerb } from '@/design-system/components/record-ledger/record-model';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useShipmentRecord } from '@/lib/shipments/shipment-record-client';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { toast } from '@/lib/toast';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { ResolveShipmentExceptionDialog } from './ResolveShipmentExceptionDialog';
import { isOpenExceptionStatus, shipmentRecordFace } from './shipped-package-state';

const ICON_CLASS = 'size-3.5';


function shipmentModel(record: ShipmentRecord, onOpenShipment: (shipmentId: number) => void): RecordModel {
  const face = shipmentRecordFace(record);
  const fulfilled = record.shipOut != null;
  const orderRefs = [...new Set(record.items.map((item) => item.orderRef || `#${item.orderRowId}`))];
  const totalUnits = record.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const carrierEvents = record.actions
    .filter((action) => action.source === 'carrier')
    .map((action, index) => ({
      id: index + 1,
      eventOccurredAt: action.at,
      category: action.kind,
      label: action.label,
      description: action.detail,
      city: null,
      state: null,
      exception: null,
      signedBy: null,
    }));

  return {
    key: `shipment:${record.shipmentId}`,
    title: {
      ref: record.tracking,
      platform: null,
      channel: record.carrier ?? 'Package',
      date: record.shipOut
        ? { label: formatDateTimePST(record.shipOut.at), tip: `Scanned out ${formatDateTimePST(record.shipOut.at)}` }
        : record.pack
          ? { label: formatDateTimePST(record.pack.packedAt), tip: `Packed ${formatDateTimePST(record.pack.packedAt)}` }
          : null,
    },
    status: {
      label: fulfilled ? 'Scanned out' : face.label,
      detail: fulfilled ? (face.label === 'Delivered' ? 'Delivered by carrier' : 'Scanned out from fulfillment') : undefined,
      tone: fulfilled ? 'success' : face.tone,
    },
    alerts: [],
    exception: record.exception && isOpenExceptionStatus(record.exception.status)
      ? {
          why: (record.exception.reason || 'Package exception').replace(/_/g, ' '),
          next: 'Resolve the package exception before treating this shipment as complete.',
        }
      : null,
    internalLabel: 'Fulfillment',
    flow: 'outbound',
    partyTitle: 'Order',
    dates: [],
    promise: null,
    external: record.tracking
      ? { events: carrierEvents, carrier: record.carrier, loading: false, error: false }
      : null,
    internal: [
      {
        key: 'packed',
        label: 'Packed',
        state: record.pack ? 'done' : 'todo',
        who: record.pack?.packerName ?? null,
        at: record.pack?.packedAt ?? null,
        icon: <PackageCheck className={ICON_CLASS} aria-hidden />,
        tone: 'fulfillment',
      },
      {
        key: 'scanned-out',
        label: 'Scanned out',
        state: record.shipOut ? 'done' : 'todo',
        who: record.shipOut?.staffName ?? null,
        at: record.shipOut?.at ?? null,
        detail: record.shipOut?.backfilled ? 'Recorded by ops backfill' : null,
        icon: <Truck className={ICON_CLASS} aria-hidden />,
        tone: 'success',
      },
      {
        key: 'delivered',
        label: 'Delivered',
        state: record.status.isDelivered ? 'done' : 'todo',
        at: record.carrierMilestones.deliveredAt,
        icon: <PackageCheck className={ICON_CLASS} aria-hidden />,
        tone: 'success',
      },
    ],
    stepAssign: null,
    items: record.items.map((item, index) => ({
      key: `${item.orderRowId}:${item.sku ?? index}`,
      title: item.title || 'Untitled line',
      sku: item.sku,
      skuCatalogId: null,
      photoUrl: item.photoUrl,
      received: item.quantity,
      expected: item.quantity,
      short: false,
      condition: item.condition,
      conditionGrade: item.condition,
      listing: null,
      serials: item.serials.map((serial) => serial.serial),
      serialNote: null,
      cost: null,
      facts: [
        ...(item.orderRef ? [{ label: 'Order', value: <span className={RECORD_ID_CLASS}>{item.orderRef}</span> }] : []),
        ...(item.channel ? [{ label: 'Channel', value: item.channel }] : []),
        ...(item.orderStatus ? [{ label: 'Order status', value: item.orderStatus }] : []),
      ],
      current: index === 0,
    })),
    itemsNotice: record.items.length === 0 ? 'No order line is linked to this package.' : null,
    itemsSummary: totalUnits > 0 ? `fulfilled ${totalUnits}/${totalUnits}` : null,
    serials: [...new Set(record.items.flatMap((item) => item.serials.map((serial) => serial.serial)))],
    expectedUnits: totalUnits || undefined,
    notes: [],
    activity: [],
    staffNote: null,
    price: null,
    currency: null,
    refresh: null,
    photos: null,
    party: [
      { label: orderRefs.length > 1 ? 'Orders' : 'Order', value: orderRefs.length > 0 ? orderRefs.join(', ') : 'No order linked' },
    ],
    movement: [
      { label: 'Tracking', value: <span className={cn(RECORD_ID_CLASS, 'select-all break-all')}>{record.tracking}</span> },
      { label: 'Carrier', value: record.carrier ?? 'Unknown' },
      { label: 'Box', value: record.box ? `${record.box.seq ?? '—'} of ${record.box.total}${record.box.isPrimary ? ' · primary' : ''}` : 'Single box' },

      ...(record.siblings.length > 0
        ? [{
            label: 'Other boxes',
            value: (
              <span className="flex flex-wrap gap-x-2 gap-y-1">
                {record.siblings.map((sibling) => (
                  <button
                    key={sibling.shipmentId}
                    type="button"
                    onClick={() => onOpenShipment(sibling.shipmentId)}
                    className={cn('text-left text-text-info hover:underline', focusRing('control'))}
                  >
                    {sibling.boxSeq != null ? `Box ${sibling.boxSeq}: ` : ''}{sibling.tracking}
                  </button>
                ))}
              </span>
            ),
          }]
        : []),
    ],
    loadFailed: null,
  };
}

export interface ShipmentRecordSlot {
  title: ReactNode;
  actions?: ReactNode;
  view: ReactNode;
}

/** One place the fulfilled ledger reads and presents an open package. */
export function useShipmentRecordSlot(
  shipmentId: number | null,
  onOpenShipment: (shipmentId: number) => void,
): ShipmentRecordSlot | null {
  const query = useShipmentRecord(shipmentId);
  const record = query.data ?? null;
  const [resolveOpen, setResolveOpen] = useState(false);
  const model = useMemo(() => (record ? shipmentModel(record, onOpenShipment) : null), [record, onOpenShipment]);
  const exceptionOpen = record?.exception != null && isOpenExceptionStatus(record.exception.status);
  const verbs = useMemo<RecordVerb[]>(() => {
    if (!record) return [];
    const list: RecordVerb[] = [];
    if (exceptionOpen) {
      list.push({
        id: 'resolve-exception',
        label: 'Resolve exception',
        icon: <PackageCheck className={ICON_CLASS} />,
        hotkey: 'r',
        run: () => setResolveOpen(true),
      });
    }
    list.push({
      id: 'copy-tracking',
      label: 'Copy tracking',
      icon: <Copy className={ICON_CLASS} />,
      run: () =>
        void navigator.clipboard?.writeText(record.tracking).then(
          () => toast.success(`Copied ${record.tracking}`),
          () => toast.error('Copy failed'),
        ),
    });
    if (record.trackingUrl) {
      const url = record.trackingUrl;
      list.push({
        id: 'track',
        label: `Track on ${record.carrier || 'carrier'}`,
        icon: <ExternalLink className={ICON_CLASS} />,
        run: () => void window.open(url, '_blank', 'noopener,noreferrer'),
      });
    }
    return list;
  }, [exceptionOpen, record]);
  const slot = useRecordSlot(model, verbs, record ? `Package ${record.tracking} actions` : 'Package actions', 'shipped-record');

  if (shipmentId == null) return null;
  if (query.isPending) {
    return {
      title: 'Package',
      view: <div className="flex flex-1 flex-col bg-mode-canvas p-4" data-testid="shipped-record-view" aria-busy><SkeletonList count={4} type="row" /></div>,
    };
  }
  if (query.isError) {
    return {
      title: 'Package',
      view: <div className="flex flex-1 flex-col bg-mode-canvas p-4" data-testid="shipped-record-view"><EvidenceNotice tone="warn">{query.error.message}</EvidenceNotice></div>,
    };
  }
  if (!slot || !record) return null;

  return {
    title: slot.title,
    actions: slot.actions,
    view: (
      <>
        {slot.view}
        {exceptionOpen ? <ResolveShipmentExceptionDialog open={resolveOpen} onOpenChange={setResolveOpen} record={record} /> : null}
      </>
    ),
  };
}
