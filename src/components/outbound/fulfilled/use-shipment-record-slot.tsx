'use client';

/** Fulfilled's package record: one shipment read, one shared record slot — what a shipped order's details open (`/fulfilled?openOrderId=` → `?shipment=`). */

import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, PackageCheck, RefreshCw, Truck } from '@/components/Icons';
import { CarrierEventsRail } from '@/design-system/components/record-ledger/CarrierEventsRail';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import type { RecordModel, RecordVerb } from '@/design-system/components/record-ledger/record-model';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { Button } from '@/design-system/primitives/Button';
import type { CarrierEvent } from '@/lib/queries/carrier-events-query';
import { FULFILLED_BUCKETS } from '@/lib/nav/locate/bucket-precedence';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import { useRefreshShipmentTracking, useShipmentRecord } from '@/lib/shipments/shipment-record-client';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { writeClipboardText } from '@/lib/clipboard';
import { toast } from '@/lib/toast';
import { formatDateTimePST } from '@/utils/date';
import { ResolveShipmentExceptionDialog } from './ResolveShipmentExceptionDialog';
import { ShipmentJourneyRail } from './ShipmentJourneyRail';
import { JourneyClockCell } from './JourneyClockCell';
import { OrderThread } from './OrderThread';
import { isOpenExceptionStatus, shipmentRecordFace } from './shipment-record-face';
import { NAV_FULFILLED_QUERY_ROOT } from './useFulfilledList';

const ICON_CLASS = 'size-3.5';

/** The record's test id — RecordView prefixes its own parts with it; the External half's rails follow suit. */
const RECORD_TEST_ID = 'shipped-record';

/** `nowMs` = the read's instant: the journey's live gap runs to it. `thread` = the order's one thread (notes, alerts, carrier changes). */
function shipmentModel(record: ShipmentRecord, onOpenShipment: (shipmentId: number) => void, nowMs: number, thread: ReactNode): RecordModel {
  const face = shipmentRecordFace(record);
  const fulfilled = record.shipOut != null;
  // Each order once, in line order: [face, order number] — a line with no number shows its row id.
  const orderRefs = [
    ...new Map<string, string | null>(record.items.map((item) => [item.orderRef ?? `#${item.orderRowId}`, item.orderRef])).entries(),
  ];
  const totalUnits = record.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const carrierEvents: CarrierEvent[] = record.actions
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
    // The order leads (L3 is the ORDER, operator 2026-10-06): its full number and platform; the tracking is a movement fact.
    title: {
      ref: record.items.find((item) => item.orderRef)?.orderRef ?? record.tracking,
      platform: null,
      channel: record.items.find((item) => item.channel)?.channel ?? record.carrier ?? 'Package',
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
    // The External half: the post-ship journey (hand-off → customer), then the carrier's own scans.
    external: record.tracking
      ? {
          node: (
            <>
              <ShipmentJourneyRail
                journey={record.journey}
                carrierEventAts={carrierEvents.flatMap((event) => (event.eventOccurredAt ? [event.eventOccurredAt] : []))}
                nowMs={nowMs}
                testId={`${RECORD_TEST_ID}-journey`}
              />
              <div className="border-t border-mode-fact">
                <CarrierEventsRail
                  events={carrierEvents}
                  carrier={record.carrier}
                  loading={false}
                  error={false}
                  testId={`${RECORD_TEST_ID}-carrier-events`}
                />
              </div>
            </>
          ),
        }
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
        ...(item.orderRef ? [{ label: 'Order', value: <RecordFullId value={item.orderRef} label="order number" /> }] : []),
        ...(item.channel ? [{ label: 'Platform', value: item.channel }] : []),
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
    staffNote: thread,
    notesTitle: 'Thread',
    price: null,
    currency: null,
    refresh: null,
    photos: null,
    party: [
      {
        label: orderRefs.length > 1 ? 'Orders' : 'Order',
        value:
          orderRefs.length > 0 ? (
            <span className="flex min-w-0 flex-wrap gap-x-2">
              {orderRefs.map(([key, ref]) =>
                ref ? <RecordFullId key={key} value={ref} label="order number" /> : <span key={key}>{key}</span>,
              )}
            </span>
          ) : (
            'No order linked'
          ),
      },
    ],
    movement: [
      { label: 'Tracking', value: <RecordFullId value={record.tracking} label="tracking number" className="whitespace-normal break-all" /> },
      { label: 'Carrier', value: record.carrier ?? 'Unknown' },
      { label: 'Box', value: record.box ? `${record.box.seq ?? '—'} of ${record.box.total}${record.box.isPrimary ? ' · primary' : ''}` : 'Single box' },

      ...(record.siblings.length > 0
        ? [{
            label: 'Other boxes',
            value: (
              <span className="flex flex-wrap gap-x-2 gap-y-1">
                {record.siblings.map((sibling) => (
                  <Button
                    key={sibling.shipmentId}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenShipment(sibling.shipmentId)}
                    className="h-auto justify-start whitespace-normal break-all py-1 text-left"
                  >
                    {sibling.boxSeq != null ? `Box ${sibling.boxSeq}: ` : ''}{sibling.tracking}
                  </Button>
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
  view: ReactNode;
}

/**
 * One place Fulfilled reads and presents an open order: its package record,
 * headed by the order (number, platform, customer, its status word and clock
 * from the desk's own row `entry`), with the order's thread.
 */
export function useShipmentRecordSlot(
  shipmentId: number | null,
  onOpenShipment: (shipmentId: number) => void,
  entry: BulkEntry | null,
): ShipmentRecordSlot | null {
  const query = useShipmentRecord(shipmentId);
  const record = query.data ?? null;
  const [resolveOpen, setResolveOpen] = useState(false);
  const queryClient = useQueryClient();
  const refresh = useRefreshShipmentTracking(shipmentId ?? 0);
  const model = useMemo(() => {
    if (!record) return null;
    const orderRowIds = [...new Set(record.items.map((item) => item.orderRowId).filter((id) => id > 0))];
    const thread = <OrderThread orderRowIds={orderRowIds} carrierActions={record.actions} testId={`${RECORD_TEST_ID}-thread`} />;
    return shipmentModel(record, onOpenShipment, query.dataUpdatedAt, thread);
  }, [record, onOpenShipment, query.dataUpdatedAt]);
  const exceptionOpen = record?.exception != null && isOpenExceptionStatus(record.exception.status);
  const refreshing = refresh.isPending;
  const refreshNow = refresh.mutateAsync;
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
    // Ask the carrier again now, then re-read the record and the desk so both show what it just said.
    list.push({
      id: 'refresh',
      label: refreshing ? 'Refreshing…' : 'Refresh now',
      icon: <RefreshCw className={ICON_CLASS} />,
      disabled: refreshing,
      run: async () => {
        try {
          await refreshNow();
        } catch (error) {
          toast.error(`Couldn't refresh ${record.tracking}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        await queryClient.invalidateQueries({ queryKey: [NAV_FULFILLED_QUERY_ROOT] });
      },
    });
    list.push({
      id: 'copy-tracking',
      label: 'Copy tracking',
      icon: <Copy className={ICON_CLASS} />,
      run: () => {
        if (writeClipboardText(record.tracking)) toast.success(`Copied ${record.tracking}`);
        else toast.error('Copy failed');
      },
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
  }, [exceptionOpen, record, refreshing, refreshNow, queryClient]);
  const slot = useRecordSlot(model, verbs, record ? `Package ${record.tracking} actions` : 'Package actions', RECORD_TEST_ID);

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
    title: (
      <span className="flex min-w-0 items-center gap-3">
        {slot.title}
        {entry ? <OrderHead entry={entry} /> : null}
      </span>
    ),
    view: (
      <>
        {slot.view}
        {exceptionOpen ? <ResolveShipmentExceptionDialog open={resolveOpen} onOpenChange={setResolveOpen} record={record} /> : null}
      </>
    ),
  };
}

/** The order's head beside its number: the customer, then its status word and time in status against the limit. */
function OrderHead({ entry }: { entry: BulkEntry }) {
  const facts = entry.facts ?? null;
  const bucket = FULFILLED_BUCKETS.find((candidate) => candidate.id === entry.buckets[0]);
  return (
    <span className="flex min-w-0 items-center gap-2 text-role-caption text-text-muted" data-testid={`${RECORD_TEST_ID}-head`}>
      {facts?.customer ? <span className="min-w-0 truncate font-medium text-text-default">{facts.customer}</span> : null}
      {bucket ? <JourneyClockCell clock={facts?.clock} status={bucket.label} className="shrink-0" /> : null}
    </span>
  );
}
