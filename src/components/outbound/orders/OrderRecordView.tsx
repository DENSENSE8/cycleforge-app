'use client';

/**
 * The outbound ORDER RECORD — one record view for every desk that shares the industrial ledger (To Ship, Pending, Exceptions, the Search…
 * when the staffer chooses fullscreen (owner 2026-09-25,
 * (`OrderRecordActionStrip`, owner 2026-09-25).
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RecordFlowFacts, RecordFlowSection, recordFlowLabels } from '@/design-system/components/RecordFlowFacts';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import {
  daysLateOn,
  queueRowStaff,
  type OrdersQueueCommits,
} from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { ordersCompoundView, ordersOrderedAt } from '@/lib/orders/orders-compound-view';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { ORDER_STAGE_KINDS, orderStage } from '@/lib/orders/order-stages';
import type { CompoundStageStepFacts } from '@/components/tables/compound/compound-row-model';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { orderAdminUrl } from '@/utils/order-platform';
import { ListingLinkEditor, OrderAdminLinkAction } from './order-link-editors';
import { formatMonthDayTimePST } from '@/utils/date';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { EvidenceDisclosure } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import type { OrderRecordSectionId } from '@/lib/selection-context/order-inspector-context';
import { VIEW_SPECS, type OrderViewKey } from '@/lib/views/view-specs';
import { OrderPriceEvidence } from './OrderPriceEvidence';
import { OrderAutoAssignRuleAction } from './OrderAutoAssignRuleAction';
import { useOrderRecordMoreVerbs } from './to-ship/MorphingRowActionMenu';
import { subscribeOpenOrderPaperwork } from '@/utils/events';
import { consumeReplaceTrackingIntent, subscribeReplaceTrackingIntent } from '@/lib/order-inspector/replace-tracking-intent';
import {
  OrderCustomerGroup,
  OrderLabelsSection,
  OrderShipToEditor,
  OrderShipToRow,
  OrderTrackingLine,
  orderBuyer,
} from './order-record-sections';
import { LIFECYCLE, STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { IconButton } from '@/design-system/primitives';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { formatCurrency } from '@/utils/_number';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { initials, recordState, worstState } from './outbound-orders-ledger-state';
import { StepRail, type RailStep, type StepState } from '@/design-system/components/record-ledger/StepRail';
import { Calendar, Check, ExternalLink, FileText, Package, PackageSearch, Pencil, ShieldCheck, Truck } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CopyableCellValue, SerialChip } from '@/components/ui/CopyChip';
import {
  LedgerCondition,
  LedgerOpenAction,
  LedgerSkuBinPicker,
  LedgerQty,
  LedgerShipBy,
  LedgerStageAssign,
  stageFacts,
} from './outbound-orders-ledger-editors';
import { PaperworkPanel, type PaperworkTab } from './paperwork/PaperworkDocuments';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { OrderPhotoPeek } from './OrderPhotoPeek';
import { OrderPhotoStrip } from './OrderPhotoStrip';
import type { UnitTimelinePhotoRowSource } from '@/lib/timeline/unit-photos-events';
import { OrderPoLinksRow } from './OrderPoLinksRow';
import { OrderNotesPanel } from './notes/OrderNotesPanel';
import { requestOrderNoteFocus } from './notes/order-note-focus';
import { TrackingReplaceField } from './tracking/TrackingReplaceField';
import { TrackingHistory } from './tracking/TrackingHistory';
import { DeliveryPromise } from './tracking/DeliveryPromise';
import { useOrderRecordKeys } from './record-keys/useOrderRecordKeys';
import { OrderRecordSummaryBar } from './record-keys/OrderRecordSummaryBar';
import { usePrintPackingSlip } from './record-keys/print-slip';
import { toast } from '@/lib/toast';
import { refreshDomain } from '@/lib/refresh/bus';
import { patchOrderQcAssignee } from '@/lib/qc/qc-assignee-client';
import { DuplicateOrderBanner } from './facts/DuplicateOrderBanner';
import { useOrderChannel } from '@/hooks/useCatalog';
import { platformMetaIconTone } from '@/lib/source-platform';
import { platformDisplayName } from '@/lib/platform-display';
import { orderCarrierEventsQuery, type OrderCarrierEvent } from '@/lib/queries/order-carrier-events-query';
import { LedgerPhotoViewer } from './outbound-orders-ledger-photos';
import { linePhotoLabel } from '@/lib/photos/line-photos';
import {
  carrierStatusTone,
  fulfillmentCurrentStatus,
  hasExternalFulfillmentHandoff,
} from '@/lib/orders/order-fulfillment-summary';

/** One column of the record: the industrial panel its sections stack in. */
const COLUMN_CLASS = DESK_RECORD_COLUMN_CARD_CLASS;

/** Which evidence stage each inline photo strip shows — packing under Packed, testing under QC, receiving on the item. */
const PACKING_PHOTO_SOURCES: readonly UnitTimelinePhotoRowSource[] = ['packing'];
const TESTING_PHOTO_SOURCES: readonly UnitTimelinePhotoRowSource[] = ['testing'];
const RECEIVED_PHOTO_SOURCES: readonly UnitTimelinePhotoRowSource[] = ['arrival', 'unbox_carton', 'unbox_item'];

interface OrderRecordViewProps {
  /** The view this record opens on — its spec decides which sections paint. */
  viewKey: OrderViewKey;
  /** The open record (live row). */
  record: ShippedOrder;
  /** The painted queue — the order's other lines, and every order the rule editor assigns. */
  records: readonly ShippedOrder[];
  todayKey: string;
  getStaffName: (id: number) => string;
  commits: OrdersQueueCommits;
  /** The view's own job for this order, painted at the `resolve` section (Exceptions: the SKU pairing form). */
  resolve?: ReactNode;
  /**
   * The triage bar's Documents verb: open this order straight on its
   * documents (packing slip first). A fresh `nonce` re-opens them.
   */
  documentsRequest?: { orderId: number; nonce: number } | null;
}

/** The lines of one order the painted queue holds, the open line first when the queue lacks it. */
function orderLines(record: ShippedOrder, records: readonly ShippedOrder[]): readonly ShippedOrder[] {
  const orderKey = String(record.order_id ?? '').trim();
  const siblings = orderKey ? records.filter((line) => String(line.order_id ?? '').trim() === orderKey) : [];
  return siblings.some((line) => Number(line.id) === Number(record.id)) ? siblings : [record, ...siblings];
}

/**
 * The record header's title — the ONE place the order number reads (owner
 * 2026-09-27), with the platform / saved admin link right beside it (add-link
 * state when none). Every desk that opens an order record passes this as the
 * plane's `title`.
 */
export function OrderRecordTitle({ record, records }: { record: ShippedOrder; records: readonly ShippedOrder[] }) {
  const orderId = String(record.order_id ?? '').trim();
  const face = orderId || String(record.id);
  const channel = useOrderChannel()(face, record.account_source ?? null);
  const platformTone = platformMetaIconTone(channel.meta);
  const platformClass = channel.meta.value ? platformTone.className : STATE_TONE_CLASSES.info.text;
  const platformStyle = channel.meta.value ? platformTone.style : undefined;
  const platformName = platformDisplayName(channel);
  const orderedAt = ordersOrderedAt(record);
  return (
    <span className="group/order-title relative flex min-w-max flex-nowrap items-center gap-1 whitespace-nowrap" data-testid="order-record-title">
      <span className={cn('shrink-0', platformClass)} style={platformStyle} aria-hidden>#</span>
      <OrderAdminLinkAction
        orderId={face}
        href={orderAdminUrl(orderId, record.account_source ?? null, record.admin_url)}
        storedUrl={String(record.admin_url ?? '').trim() || null}
        ids={orderLines(record, records).map((line) => Number(line.id))}
        platformLabel={platformName}
        revealOpenOnHover
      >
        <span className="flex min-w-max flex-nowrap items-center gap-1 whitespace-nowrap" aria-label={`Order ${face} on ${platformName}`}>
          <span className="shrink-0">{face}</span>
          <span className="size-1 shrink-0 rounded-mode-pill bg-mode-edge" aria-hidden />
          <span
            className="shrink-0 text-role-data font-medium normal-case tracking-normal text-mode-muted"
            data-testid="order-record-platform"
          >
            {platformName}
          </span>
        </span>
      </OrderAdminLinkAction>
      {orderedAt ? (
        <>
          <span className="size-1 shrink-0 rounded-mode-pill bg-mode-edge" aria-hidden />
          <span
            className="shrink-0 text-role-data font-medium tabular-nums text-mode-muted"
            title={orderedAt.tip}
            data-testid="order-record-ordered-at"
          >
            {orderedAt.label}
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * The order's ONE status, top-right of the record header (owner 2026-09-27):
 * the worst state across its lines and where it goes next. The item groups
 * carry no state badge of their own.
 */
export function OrderRecordStatus({ record, records }: { record: ShippedOrder; records: readonly ShippedOrder[] }) {
  const lines = orderLines(record, records);
  const state = worstState(lines.map(recordState));
  const worst = lines.find((line) => recordState(line) === state) ?? record;
  const next = ordersCompoundView(worst, { stateLabel: null, delayDays: null, todayKey: '' }).nextStep ?? null;
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="order-record-status">
      <LifecycleCode state={state} srLabel={null} />
      {next ? (
        <span
          className={cn(RECORD_LABEL_CLASS, 'hidden truncate @md/record-head:inline', next.blocked ? 'text-mode-warn' : 'text-mode-muted')}
          title={next.tip}
          data-testid="evidence-next-step"
        >
          {next.label}
        </span>
      ) : null}
    </span>
  );
}

function carrierEventTitle(event: OrderCarrierEvent): string {
  const category = String(event.category ?? '').replaceAll('_', ' ').toLowerCase();
  return String(event.description ?? event.label ?? (category || 'Carrier update')).trim();
}

/** Carrier scans are the external half of Fulfillment, chronological left → right. */
function CarrierFulfillmentRail({ orderId, record }: { orderId: number; record: ShippedOrder }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const query = useQuery({ ...orderCarrierEventsQuery(orderId), enabled: Number.isInteger(orderId) && orderId > 0 });
  const carrier = String(query.data?.carrier ?? record.carrier ?? '').trim().toUpperCase();
  const integrationPending = carrier === 'USPS';
  const fallback: OrderCarrierEvent[] = record.latest_status_label || record.latest_status_description
    ? [{
        id: -1,
        eventOccurredAt: record.latest_event_at ?? null,
        category: record.latest_status_category ?? null,
        label: record.latest_status_label ?? null,
        description: record.latest_status_description ?? null,
        city: null,
        state: null,
        exception: record.has_exception ? record.latest_status_description ?? 'Carrier exception' : null,
        signedBy: null,
      }]
    : [];
  const events = [...(query.data?.events.length ? query.data.events : fallback)].reverse();
  const rail: RailStep[] = integrationPending
    ? [{
        id: 'carrier:integration-pending',
        icon: <Truck aria-hidden />,
        state: 'current',
        tone: 'neutral',
        title: 'USPS integration pending',
        meta: 'Live carrier updates are not connected yet',
      } satisfies RailStep]
    : events.length > 0
    ? events.map((event) => {
        const location = [event.city, event.state].filter(Boolean).join(', ');
        return {
          id: `carrier:${event.id}`,
          icon: <Truck aria-hidden />,
          state: 'done',
          tone: carrierStatusTone(event.category),
          title: carrierEventTitle(event),
          meta: [event.eventOccurredAt ? formatMonthDayTimePST(event.eventOccurredAt) : null, location || null]
            .filter(Boolean)
            .join(' · ') || undefined,
          detail: event.exception ?? (event.signedBy ? `Signed by ${event.signedBy}` : undefined),
        } satisfies RailStep;
      })
    : [{
        id: 'carrier:pending',
        icon: <Truck aria-hidden />,
        state: query.isLoading ? 'pending' : 'current',
        tone: query.isError ? 'danger' : 'neutral',
        title: query.isError ? 'Carrier updates unavailable' : 'Carrier handoff',
        meta: query.isLoading ? 'Loading updates' : 'Awaiting first carrier event',
      } satisfies RailStep];
  const latestRailId = rail.at(-1)?.id ?? null;

  // Carrier history reads chronologically left → right, but the operator opens
  // this row to see what is true NOW. The query, fonts and responsive rail can
  // all establish their final width after first paint, so keep the initial
  // viewport pinned to the newest edge through those layout changes instead of
  // relying on one early scroll assignment.
  useLayoutEffect(() => {
    let frame: number | null = null;
    const pinToLatest = () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    };
    const schedulePin = () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(pinToLatest);
    };

    pinToLatest();
    schedulePin();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedulePin);
    if (observer && contentRef.current) observer.observe(contentRef.current);

    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [latestRailId]);

  return (
    <div className="min-w-0 px-4 py-3" data-testid="order-record-carrier-fulfillment">
      <div
        ref={viewportRef}
        className="min-w-0 overflow-x-auto overscroll-x-contain pb-1 scrollbar-thin"
        tabIndex={0}
        data-testid="carrier-fulfillment-scroll"
        data-initial-edge="latest"
      >
        <div ref={contentRef} className="min-w-max">
          <StepRail
            steps={rail}
            size="lg"
            label="Carrier fulfillment events"
            orientation="horizontal"
            horizontalScroll
          />
        </div>
      </div>
    </div>
  );
}

function FulfillmentSourceLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-mode-pill bg-mode-well px-2 text-role-micro font-semibold text-mode-muted">
      {children}
    </span>
  );
}

export function OrderRecordView({
  viewKey,
  record,
  records,
  todayKey,
  getStaffName,
  commits,
  resolve,
  documentsRequest,
}: OrderRecordViewProps) {
  const shows = new Set<OrderRecordSectionId>(VIEW_SPECS[viewKey].record);
  const r = record as QueueRowRecord;
  const view = ordersCompoundView(record, {
    stateLabel: null,
    delayDays: daysLateOn(
      todayKey,
      (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
    ),
    todayKey,
  });
  const orderId = view.orderId ?? '';
  const orderRef = orderId || String(record.id);
  const buyer = orderBuyer(record);

  // Every line of this order the queue holds, in ledger order; the open line
  // leads when the queue does not carry it (a deep link before the rows land).
  const lines = orderLines(record, records);
  const moreVerbs = useOrderRecordMoreVerbs(record, viewKey);

  // Paperwork opens INLINE in place of the details (owner 2026-09-26: never a
  // popover); Back returns. A new record always opens on its details.
  const [paperwork, setPaperwork] = useState<{ tab: PaperworkTab; itemNumber: string | null; orderId: number } | null>(null);
  const [openVerbId, setOpenVerbId] = useState<string | null>(null);
  // Shipping's ONE Edit (owner 2026-09-27): tracking # and ship by become editable together.
  const [editingShipping, setEditingShipping] = useState(false);
  // Replace tracking — always one click away on the tracking line (owner
  // 2026-09-27: a voided label's number gives way to the new one without Edit).
  const [replacingTracking, setReplacingTracking] = useState(false);
  const openVerb = moreVerbs.find((verb) => verb.id === openVerbId) ?? null;
  useEffect(() => {
    setPaperwork(null);
    setOpenVerbId(null);
    setEditingShipping(false);
    setReplacingTracking(false);
  }, [record.id]);
  // The queue row's "Replace tracking" arms an intent, then opens this record: land in replace.
  useEffect(() => {
    const take = () => {
      if (consumeReplaceTrackingIntent(Number(record.id))) setReplacingTracking(true);
    };
    take();
    return subscribeReplaceTrackingIntent(take);
  }, [record.id]);
  // The Paperwork action (top strip ⋮ or More actions) opens it here.
  useEffect(
    () =>
      subscribeOpenOrderPaperwork((orderId, tab) => {
        if (orderId === Number(record.id)) setPaperwork({ tab: tab ?? 'shipping_label', itemNumber: null, orderId });
      }),
    [record.id],
  );
  // Documents from the triage bar: declared after the reset above, so a record
  // that mounts on this request lands on its documents, not its details.
  const requestedDocumentsFor = documentsRequest && documentsRequest.orderId === Number(record.id) ? documentsRequest.nonce : null;
  useEffect(() => {
    if (requestedDocumentsFor == null) return;
    setPaperwork({ tab: 'packing_slip', itemNumber: null, orderId: Number(record.id) });
  }, [requestedDocumentsFor, record.id]);

  // Inline saves carry an Undo (owner 2026-09-27): the toast restores the value
  // the field held before, through the same commit.
  // The toast waits for the server to accept the write, so Undo can never race it.
  const commitTracking = (tracking: string) => {
    const previous = view.tracking ?? null;
    commits.handleCommitTracking(
      record,
      tracking,
      previous && previous !== tracking
        ? () => toast.undo(`Tracking replaced · ${tracking}`, { onUndo: () => commits.handleCommitTracking(record, previous) })
        : undefined,
    );
  };
  const commitShipBy = (dateKey: string | null) => {
    const previous = view.delay?.dateKey ?? null;
    // A ship-by cannot be cleared through this waist, so only a date-to-date change offers Undo.
    commits.handleCommitShipBy(
      record,
      dateKey,
      previous && dateKey && previous !== dateKey
        ? () => toast.undo(`Ship by ${formatShipByFace(dateKey, 0)}`, { onUndo: () => commits.handleCommitShipBy(record, previous) })
        : undefined,
    );
  };

  // The record's own keys (T · N · E · M), listed in the `?` overview as "This record".
  const slip = usePrintPackingSlip(Number(record.id));
  useOrderRecordKeys({
    enabled: paperwork == null,
    onReplaceTracking: shows.has('facts') ? () => setReplacingTracking(true) : undefined,
    onFocusNote: shows.has('note') ? () => requestOrderNoteFocus(Number(record.id)) : undefined,
    onEditShipping: shows.has('facts') ? () => setEditingShipping((open) => !open) : undefined,
    onPrintSlip: slip.print,
  });

  // ── F-pattern groups (owner 2026-09-27) ────────────────────────────────────
  // Left, the work:  Items (each line with its price) → Payment → Fulfilment →
  // Notes → Documents → Timeline.
  // Right, the facts: Customer → Shipping → Conversation → More actions.
  // Each group is one `RecordGroup` (title top-left, ≤1 action top-right); the
  // order number and its ONE status read in the record header
  // (`OrderRecordTitle` / `OrderRecordStatus`).
  const lineProps = (line: ShippedOrder) => ({
    line,
    current: Number(line.id) === Number(record.id),
    todayKey,
    records,
    getStaffName,
    commits,
  });
  const multi = lines.length > 1;
  const allocateDetail = VIEW_SPECS[viewKey].recordPresentation === 'allocate';
  const externalFulfillmentVisible = allocateDetail && hasExternalFulfillmentHandoff(lines);
  const currentFulfillment = fulfillmentCurrentStatus(lines);
  const buyerNote = String(record.buyer_note ?? '').trim() || null;
  const immediateOrderTotal = lines.reduce<number | null>((total, line) => {
    if (line.sale_amount == null || line.sale_amount === '') return total;
    const amount = Number(line.sale_amount);
    if (!Number.isFinite(amount)) return total;
    return (total ?? 0) + amount;
  }, null);
  const fulfillmentDeadline = shows.has('facts') ? (
    <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap">
      <span
        className="inline-flex min-w-0 items-center gap-1.5 text-mode-muted"
        title={`Imported into CycleForge · ${formatMonthDayTimePST(record.created_at)}`}
        data-testid="fulfillment-imported-at"
      >
        <span className={cn(RECORD_LABEL_CLASS, 'hidden shrink-0 @sm:inline')}>Imported</span>
        <span className="text-role-caption tabular-nums">{formatMonthDayTimePST(record.created_at)}</span>
      </span>
      <span className="size-1 shrink-0 rounded-full bg-mode-edge" aria-hidden />
      {editingShipping ? (
        <span className="block h-8 w-40">
          <LedgerShipBy
            dateKey={view.delay?.dateKey ?? null}
            overdueDays={view.delay?.overdue ? view.delay.days : 0}
            dueToday={Boolean(view.delay?.dueToday)}
            tip={view.delayTip}
            onCommit={commitShipBy}
          />
        </span>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5" title={view.delayTip} data-testid="fulfillment-ship-by">
          <Calendar className="size-3.5 shrink-0 text-mode-muted" aria-hidden />
          <span className={cn(RECORD_LABEL_CLASS, 'hidden shrink-0 text-mode-muted @xs:inline')}>Ship by</span>
          <span
            className={cn(
              'whitespace-nowrap text-role-data font-semibold tabular-nums',
              view.delay?.overdue ? STATE_TONE_CLASSES.danger.text : view.delay?.dateKey ? 'text-mode-ink' : 'text-mode-warn',
            )}
          >
            {formatShipByFace(view.delay?.dateKey ?? null, view.delay?.overdue ? view.delay.days : 0)}
          </span>
        </span>
      )}
    </span>
  ) : undefined;

  const fulfilmentGroup = shows.has('stages') ? (
    <RecordGroup
      title="Fulfillment"
      titleAccessory={
        allocateDetail ? (
          <span
            className={cn(
              'inline-flex min-w-0 items-center gap-1.5 text-role-data font-semibold',
              STATE_TONE_CLASSES[currentFulfillment.tone].text,
            )}
            title={currentFulfillment.detail ?? `Current status: ${currentFulfillment.label}`}
            aria-label={`Current status: ${currentFulfillment.label}`}
            data-testid="fulfillment-current-status"
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', STATE_TONE_CLASSES[currentFulfillment.tone].dot)} aria-hidden />
            <span className="truncate">{currentFulfillment.label}</span>
          </span>
        ) : undefined
      }
      action={fulfillmentDeadline}
      testId="order-record-chain"
    >
      {allocateDetail ? (
        <div className="min-w-0">
          <section
            aria-label="Internal fulfillment"
            className="grid min-w-0 grid-cols-1 @sm:grid-cols-[5.5rem_minmax(0,1fr)]"
            data-testid="fulfillment-source-internal"
          >
            <div className="px-4 pt-3 @sm:py-3">
              <FulfillmentSourceLabel>Internal</FulfillmentSourceLabel>
            </div>
            <div className="min-w-0">
              {lines.map((line) => (
                <OrderLineFulfilment
                  key={line.id}
                  {...lineProps(line)}
                  assign={shows.has('assign')}
                  named={multi}
                  compact
                />
              ))}
            </div>
          </section>
          {externalFulfillmentVisible ? (
            <section
              aria-label="External fulfillment"
              className="grid min-w-0 grid-cols-1 border-t border-mode-fact @sm:grid-cols-[5.5rem_minmax(0,1fr)]"
              data-testid="fulfillment-source-external"
            >
              <div className="px-4 pt-3 @sm:py-3">
                <FulfillmentSourceLabel>External</FulfillmentSourceLabel>
              </div>
              <CarrierFulfillmentRail orderId={Number(record.id)} record={record} />
            </section>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0">
          {lines.map((line) => (
            <OrderLineFulfilment
              key={line.id}
              {...lineProps(line)}
              assign={shows.has('assign')}
              named={multi}
              compact={false}
            />
          ))}
        </div>
      )}
    </RecordGroup>
  ) : null;

  const itemsGroup = shows.has('item') ? (
    <RecordGroup title={multi ? `Items · ${lines.length}` : 'Items'} testId="order-record-items">
      {lines.map((line) => (
        <OrderItem
          key={line.id}
          {...lineProps(line)}
          assign={shows.has('assign')}
          priceOnFloor={!shows.has('price')}
          editFacts={shows.has('facts')}
          onOpenItemPaperwork={(itemNumber) => setPaperwork({ tab: 'manual', itemNumber, orderId: Number(line.id) })}
        />
      ))}
      {allocateDetail && shows.has('price') ? (
        <OrderPriceEvidence orderId={record.id} variant="item-footer" immediateTotal={immediateOrderTotal} />
      ) : null}
      {shows.has('facts') ? (
        <div className="px-4 empty:hidden" data-testid="order-record-item-facts">
          <OrderPoLinksRow orderId={Number(record.id)} />
        </div>
      ) : null}
    </RecordGroup>
  ) : null;

  const left = (
    <div className="flex flex-col gap-4 industrial:gap-0">
      {/* A second order from the same buyer for the same SKU — caught before it ships twice. */}
      <DuplicateOrderBanner orderId={Number(record.id)} />
      {shows.has('resolve') && resolve ? <div className={COLUMN_CLASS}>{resolve}</div> : null}
      {/* Allocate leads with the process answer, not item metadata. The buyer's
          note follows it because it can change how the item is fulfilled. */}
      {allocateDetail ? fulfilmentGroup : null}
      {allocateDetail && shows.has('buyer-note') && buyerNote ? (
        <RecordGroup title="Customer note" testId="order-record-buyer-note">
          <div className="px-4 pb-3">
            <OrderNotesPanel
              key={`buyer:${record.id}`}
              orderId={Number(record.id)}
              buyerNote={buyerNote}
              accountSource={record.account_source ?? null}
              latestNote={null}
              showBuyerNote
              showNote={false}
            />
          </div>
        </RecordGroup>
      ) : null}
      {itemsGroup}
      {/* Payment — the money's detail, one disclosure under the items (the
          line prices read on the items). Off the Floor rail: price is noise
          during pick and pack (owner 2026-09-24). */}
      {!allocateDetail && shows.has('price') ? (
        <div className={cn(COLUMN_CLASS, 'industrial:hidden')} data-testid="order-record-price">
          <OrderPriceEvidence orderId={record.id} immediateTotal={immediateOrderTotal} />
        </div>
      ) : null}
      {allocateDetail ? null : fulfilmentGroup}
      {shows.has('note') || (!allocateDetail && shows.has('buyer-note')) ? (
        <RecordGroup title={allocateDetail ? 'Staff notes' : 'Notes'} testId="order-record-notes">
          <div className="px-4 pb-3">
            <OrderNotesPanel
              key={record.id}
              orderId={Number(record.id)}
              buyerNote={buyerNote}
              accountSource={record.account_source ?? null}
              latestNote={record.notes ?? null}
              showBuyerNote={!allocateDetail && shows.has('buyer-note')}
              showNote={shows.has('note')}
            />
          </div>
        </RecordGroup>
      ) : null}
      {/* Secondary evidence: one summary row, body mounted (and fetched) on first open. */}
      {shows.has('documents') ? (
        <div className={COLUMN_CLASS}>
          <EvidenceDisclosure key={`documents:${record.id}`} label="Documents" summary="Labels, slips, paperwork" testId="order-record-documents" lazy>
            <div className="px-4 py-3">
              <OrderDocumentsSection orderId={Number(record.id)} orderRef={orderRef} readOnly showPreview={false} flush />
            </div>
          </EvidenceDisclosure>
        </div>
      ) : null}
      {/* Allocate is a working record, not a historical audit surface. */}
      {!allocateDetail && shows.has('timeline') ? (
        <section className={cn(COLUMN_CLASS, 'empty:hidden')} data-testid="order-record-timeline" aria-label="Timeline">
          <OrderTimelineSection key={record.id} orderId={Number(record.id)} flush initialLimit={5} />
        </section>
      ) : null}
    </div>
  );

  const shippingVisible = shows.has('facts') || shows.has('shipment') || shows.has('label-entries');
  const shippingEditAction = shows.has('facts') ? (
    <IconButton
      type="button"
      size="sm"
      radius="control"
      icon={editingShipping ? <Check className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
      ariaLabel={editingShipping ? 'Done editing shipping' : 'Edit shipping'}
      title={editingShipping ? 'Done editing shipping' : 'Edit shipping'}
      aria-pressed={editingShipping}
      onClick={() => setEditingShipping((open) => !open)}
      data-testid="order-record-shipping-edit"
    />
  ) : null;
  const shippingBody = shippingVisible ? (
    <>
      <div className="flex flex-col gap-3 px-4 pb-3" data-testid="order-record-facts">
        {shows.has('facts') && !shows.has('stages') ? (
          <div className="flex min-h-8 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1" data-testid="order-record-dates">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>Ship by</span>
              {editingShipping ? (
                <span className="block h-8 w-40">
                  <LedgerShipBy
                    dateKey={view.delay?.dateKey ?? null}
                    overdueDays={view.delay?.overdue ? view.delay.days : 0}
                    dueToday={Boolean(view.delay?.dueToday)}
                    tip={view.delayTip}
                    onCommit={commitShipBy}
                  />
                </span>
              ) : (
                <span
                  title={view.delayTip}
                  className={cn(
                    'text-role-data font-medium tabular-nums',
                    view.delay?.overdue ? STATE_TONE_CLASSES.danger.text : view.delay?.dueToday ? 'text-mode-ink' : 'text-mode-muted',
                  )}
                  data-testid="evidence-ship-by"
                >
                  {formatShipByFace(view.delay?.dateKey ?? null, view.delay?.overdue ? view.delay.days : 0)}
                </span>
              )}
            </span>
          </div>
        ) : null}
        {editingShipping ? (
          <OrderShipToEditor key={record.id} orderId={Number(record.id)} customer={buyer?.customer ?? null} />
        ) : buyer ? (
          <OrderShipToRow customer={buyer.customer} />
        ) : null}
        {shows.has('facts') && (editingShipping || replacingTracking) ? (
          <TrackingReplaceField
            orderId={Number(record.id)}
            current={view.tracking ?? null}
            replacing={replacingTracking && !editingShipping}
            onCommit={(tracking) => {
              commitTracking(tracking);
              setReplacingTracking(false);
            }}
            onCancel={replacingTracking && !editingShipping ? () => setReplacingTracking(false) : undefined}
          />
        ) : shows.has('facts') || shows.has('shipment') ? (
          <OrderTrackingLine
            record={record}
            tracking={view.tracking ?? null}
            withStatus={!allocateDetail && shows.has('shipment')}
          />
        ) : null}
        {shows.has('facts') || shows.has('shipment') ? (
          <>
            <DeliveryPromise record={record} shipByDateKey={view.delay?.dateKey ?? null} />
            <TrackingHistory orderId={Number(record.id)} current={view.tracking ?? null} />
          </>
        ) : null}
      </div>
      {/* Allocate/Search keep labels inside the top-right Documents walk. The
          shipping facts must never spend a row saying “Labels · None”. */}
      {!allocateDetail && shows.has('label-entries') ? <OrderLabelsSection orderId={record.id} orderRef={orderRef} /> : null}
    </>
  ) : null;

  // Details are for reading; Allocate combines buyer + destination into one
  // information category and sends its verbs to the header overflow.
  const right = (
    <div className="flex flex-col gap-4 industrial:gap-0">
      {!allocateDetail && shows.has('customer') && buyer ? (
        <OrderCustomerGroup orderId={Number(record.id)} customer={buyer.customer} source={buyer.source} />
      ) : null}
      {allocateDetail && (buyer || shippingVisible) ? (
        <RecordFlowFacts
          direction="outbound"
          testId="order-record-customer-shipping"
          party={shows.has('customer') && buyer ? (
            <OrderCustomerGroup
              orderId={Number(record.id)}
              customer={buyer.customer}
              source={buyer.source}
              embedded
            />
          ) : undefined}
          movement={shippingVisible ? (
            <RecordFlowSection
              title={recordFlowLabels('outbound').movement}
              testId="order-record-shipping"
              action={shippingEditAction}
            >
              {shippingBody}
            </RecordFlowSection>
          ) : undefined}
        />
      ) : !allocateDetail && shippingVisible ? (
        <RecordGroup title="Shipping" testId="order-record-shipping" action={shippingEditAction || undefined}>
          {shippingBody}
        </RecordGroup>
      ) : null}
      {shows.has('conversation') ? (
        <div className={COLUMN_CLASS}>
          <EvidenceDisclosure key={`conversation:${record.id}`} label="Conversation" summary="Staff thread" testId="order-record-conversation" lazy>
            <ThreadPanel entityType="ORDER" entityId={Number(record.id)} dense className="min-h-0 flex-1" />
          </EvidenceDisclosure>
        </div>
      ) : null}
      {!allocateDetail && moreVerbs.length > 0 ? (
        <RecordGroup title="More actions" testId="order-record-more-actions" className="pb-2">
          <div className="flex flex-col px-2">
            {moreVerbs.map((verb) => (
              <button
                key={verb.id}
                type="button"
                disabled={verb.disabled}
                title={verb.disabled ? verb.disabledReason : undefined}
                data-testid={`record-more-${verb.id}`}
                aria-pressed={verb.display ? openVerbId === verb.id : undefined}
                onClick={() => (verb.display ? setOpenVerbId((open) => (open === verb.id ? null : verb.id)) : void verb.run?.())}
                className={cn(
                  'ds-raw-button flex h-8 min-w-0 items-center gap-2 rounded-mode-control px-2 text-left text-role-caption font-medium text-mode-ink hover:bg-mode-hover disabled:cursor-not-allowed disabled:opacity-40',
                  '[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_svg]:text-mode-muted',
                  focusRing('control'),
                )}
              >
                {verb.icon}
                <span className="truncate">{verb.label}</span>
              </button>
            ))}
          </div>
          {/* A form verb (create a task with this order's context) opens here, inline. */}
          {openVerb?.display ? (
            <div className="border-t border-mode-fact px-4 pt-2" data-testid="order-record-more-display">
              {openVerb.display(() => setOpenVerbId(null))}
            </div>
          ) : null}
        </RecordGroup>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex-1 bg-mode-canvas p-4 text-mode-ink industrial:p-0"
      data-testid="order-record-view"
      data-order-view={viewKey}
      data-record-presentation={VIEW_SPECS[viewKey].recordPresentation}
    >
      {paperwork ? (
        <DeskRecordLayout
          main={
            <div className={cn(COLUMN_CLASS, 'p-4')}>
              <PaperworkPanel
                orderId={paperwork.orderId}
                orderRef={orderRef}
                itemNumber={paperwork.itemNumber}
                tab={paperwork.tab}
                onTabChange={(tab) => setPaperwork((open) => (open ? { ...open, tab } : open))}
                onBack={() => setPaperwork(null)}
              />
            </div>
          }
        />
      ) : (
        <>
          {!allocateDetail ? <OrderRecordSummaryBar record={record} records={records} todayKey={todayKey} /> : null}
          <DeskRecordLayout main={left} aside={right} peek={<OrderPhotoPeek key={record.id} orderId={Number(record.id)} />} />
        </>
      )}
    </div>
  );
}

interface OrderLineProps {
  line: ShippedOrder;
  current: boolean;
  todayKey: string;
  records: readonly ShippedOrder[];
  getStaffName: (id: number) => string;
  commits: OrdersQueueCommits;
  /** The chain's Pick / Pack popovers and the auto-assign rule action (work still to do). */
  assign: boolean;
}

/** A line's display title — the Zoho item governs (`resolveSkuIdentityTitle`). */
function lineTitle(line: ShippedOrder, todayKey: string): string {
  const r = line as QueueRowRecord;
  const view = ordersCompoundView(line, { stateLabel: null, delayDays: null, todayKey });
  return (
    resolveSkuIdentityTitle({
      zoho_item_title: typeof r.zoho_item_title === 'string' ? r.zoho_item_title : null,
      catalog_product_title: line.product_title,
      sku: line.sku,
    }) || view.title
  );
}

/**
 * One line in the Items group: photo · title · **platform · SKU · item # (↗
 * listing · ✎ · copy)** · one facts row **Qty · Condition · Bin … price**
 * (owner 2026-09-27). The platform and the listing live ON the item — for
 * eBay the listing IS the item number, so the number carries its listing
 * link instead of a second "Listing" row. The price reads in the line,
 * right-aligned like a storefront order line (the line total, with the unit
 * price beside it when qty > 1); the paid / tax / label-cost / net detail is
 * the Payment group's disclosure. Who handled it lives in Fulfilment.
 */
function OrderItem({
  line,
  current,
  todayKey,
  records,
  getStaffName,
  commits,
  assign,
  onOpenItemPaperwork,
  priceOnFloor,
  editFacts,
}: OrderLineProps & {
  /** The item number's paperwork, inline in the record. */
  onOpenItemPaperwork: (itemNumber: string) => void;
  /** Keep the line price on the Floor (a desk with no Payment group — Exceptions); otherwise price is off the floor. */
  priceOnFloor: boolean;
  /** The desk edits the order's facts: the platform picker (open line) and the listing link editor. */
  editFacts: boolean;
}) {
  const view = ordersCompoundView(line, { stateLabel: null, delayDays: null, todayKey });
  const title = lineTitle(line, todayKey);
  const sku = view.detail?.sku ?? (String(line.sku ?? '').trim() || null);
  const serials = view.detail?.serials ?? [];
  const qty = Number(line.quantity);
  const units = Number.isFinite(qty) && qty > 0 ? qty : 1;
  // `orders.sale_amount` is the LINE total (unit × qty).
  const lineTotal = line.sale_amount != null && Number.isFinite(Number(line.sale_amount)) ? Number(line.sale_amount) : null;
  const [photosOpen, setPhotosOpen] = useState(false);
  const photoLabel = linePhotoLabel(line.item_number ?? null, sku);

  return (
    <article
      data-testid="order-record-item"
      data-current={current ? '' : undefined}
      aria-label={title || 'Item'}
      className={cn('border-b border-mode-fact', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 px-4 py-3">
        {view.thumbUrl ? (
          <button
            type="button"
            aria-label={`View photos for ${photoLabel}`}
            data-testid="order-record-item-photo"
            className={cn(
              'ds-raw-button relative h-28 w-28 shrink-0 cursor-zoom-in overflow-hidden border border-mode-frame bg-mode-well',
              focusRing('cell'),
            )}
            onClick={() => setPhotosOpen(true)}
          >
            <Image src={view.thumbUrl} alt="" fill unoptimized sizes="112px" className="object-contain" />
          </button>
        ) : (
          <span className="relative h-28 w-28 shrink-0 overflow-hidden border border-mode-frame bg-mode-well">
            <span className="flex h-full w-full items-center justify-center text-role-title font-black text-mode-muted industrial:font-mono" aria-hidden>
              {initials(title)}
            </span>
          </span>
        )}
        {photosOpen ? (
          <LedgerPhotoViewer
            subject={{
              skuCatalogId: Number(line.sku_catalog_id) > 0 ? Number(line.sku_catalog_id) : null,
              sku,
              itemNumber: line.item_number ?? null,
              catalogImageUrl: view.thumbUrl ?? null,
            }}
            onClose={() => setPhotosOpen(false)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="line-clamp-3 min-w-0 flex-1 text-role-body font-bold">{title || '—'}</p>
            {assign ? <OrderAutoAssignRuleAction record={line} records={records} getStaffName={getStaffName} /> : null}
          </div>
          <div
            className="grid min-w-0 grid-cols-1 gap-x-4 @sm:grid-cols-2"
            data-testid="order-record-item-ids"
          >
            <span className="group/identity flex min-h-8 min-w-0 items-center gap-2 border-b border-mode-fact">
              <span className={cn(RECORD_LABEL_CLASS, 'w-11 shrink-0 text-mode-muted')}>SKU</span>
              <span className="min-w-0 flex-1">
                <CopyableCellValue
                  value={sku}
                  display={sku ?? '—'}
                  historyKind="SKU"
                  disableCopy={!sku}
                  className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}
                />
              </span>
              {sku ? (
                <span className="shrink-0 opacity-0 transition-opacity group-focus-within/identity:opacity-100 group-hover/identity:opacity-100">
                  <HoverTooltip label="View in inventory" asChild placement="above">
                    <a
                      href={`/inventory?sku=${encodeURIComponent(sku)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${sku} in inventory`}
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-mode-control text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
                        focusRing('control'),
                      )}
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </HoverTooltip>
                </span>
              ) : null}
            </span>
            {line.item_number ? (
              <span
                className="group/identity flex min-h-8 min-w-0 items-center gap-2 border-b border-mode-fact"
                data-testid="evidence-listing"
              >
                <span className={cn(RECORD_LABEL_CLASS, 'w-11 shrink-0 text-mode-muted')}>Item</span>
                <span className="min-w-0 flex-1">
                  <CopyableCellValue
                    value={String(line.item_number).trim() || null}
                    historyKind="Item number"
                    className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}
                  />
                </span>
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/identity:opacity-100 group-hover/identity:opacity-100">
                  <HoverTooltip label="Item documents" asChild placement="above">
                    <button
                      type="button"
                      data-testid="evidence-item-paperwork"
                      aria-label="Open paperwork paired to this item number"
                      onClick={() => onOpenItemPaperwork(String(line.item_number))}
                      className={cn(
                        'ds-raw-button inline-flex size-7 items-center justify-center rounded-mode-control text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
                        focusRing('control'),
                      )}
                    >
                      <FileText className="size-3.5" aria-hidden />
                    </button>
                  </HoverTooltip>
                  {view.titleHref ? <LedgerOpenAction href={view.titleHref} label="listing" /> : null}
                  {editFacts ? (
                    <ListingLinkEditor
                      face="icon"
                      currentItem={String(line.item_number).trim() || null}
                      targets={[{ id: Number(line.id), itemNumber: line.item_number ?? null, accountSource: line.account_source ?? null }]}
                    />
                  ) : null}
                </span>
              </span>
            ) : editFacts ? (
              <span className="flex min-h-8 items-center border-b border-mode-fact">
                <ListingLinkEditor
                  face="label"
                  currentItem={null}
                  targets={[{ id: Number(line.id), itemNumber: null, accountSource: line.account_source ?? null }]}
                />
              </span>
            ) : (
              <span className="min-h-8 border-b border-mode-fact" />
            )}
          </div>
          {/* Only item-defining facts live here. Stock, allocation and empty
              location facts belong to fulfillment decisions, not identity. */}
          <div className="flex flex-wrap items-center gap-3" data-testid="order-record-item-facts-row">
            <span className="inline-flex h-8 items-center gap-2">
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Qty</span>
              <span className="block h-8 w-20">
                <LedgerQty
                  bare
                  value={units}
                  onCommit={(value) => commits.handleCommitSubtitleField(line, 'orders.qty', value)}
                />
              </span>
            </span>
            <span className="w-24">
              <LedgerCondition value={line.condition ?? null} onCommit={(value) => commits.handleCommitCondition(line, value)} />
            </span>
            {serials.length > 0 ? (
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1" data-testid="order-record-item-serials">
                <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
                  {serials.length === 1 ? 'Serial' : 'Serials'}
                </span>
                {serials.map((serial) => (
                  <SerialChip key={serial} value={serial} dense width="w-auto max-w-full" />
                ))}
              </span>
            ) : null}
            {priceOnFloor ? (
              <span className="ml-auto inline-flex shrink-0 items-baseline gap-1.5" data-testid="evidence-item-price">
                {lineTotal != null && units > 1 ? (
                  <span className="text-role-caption tabular-nums text-mode-muted">
                    {formatCurrency(lineTotal / units)} × {units}
                  </span>
                ) : null}
                <span className={cn(RECORD_PRICE_CLASS, lineTotal == null && 'text-mode-muted')}>
                  {lineTotal != null ? formatCurrency(lineTotal) : '—'}
                </span>
              </span>
            ) : null}
          </div>
          {/* How it arrived — the receiving evidence, inline on the item. */}
          <OrderPhotoStrip orderId={Number(line.id)} sources={RECEIVED_PHOTO_SOURCES} />
        </div>
      </div>
    </article>
  );
}

/**
 * One line in the Fulfillment group (owner 2026-09-27): the ladder
 * QC → Picked → Packed → Scanned out on the shared `StepRail` — a filled node
 * is done, the ringed node is where the line is now, dashed is not yet. Each
 * step holds its own details (bins under Picked, bench + pre-box under
 * Packed); Pick / Pack assignment rides the step while it is still open.
 */
function OrderLineFulfilment({
  line,
  todayKey,
  getStaffName,
  commits,
  assign,
  named,
  compact,
}: OrderLineProps & {
  /** Several lines: each block leads with its item title. */
  named: boolean;
  /** Allocate's fixed-width, left-to-right progress face. */
  compact: boolean;
}) {
  const r = line as QueueRowRecord;
  const staff = queueRowStaff(r, getStaffName);
  const view = ordersCompoundView(line, { stateLabel: null, delayDays: null, todayKey });
  const sku = view.detail?.sku ?? (String(line.sku ?? '').trim() || null);
  const locationPaths = formatOutboundStoragePath(line.storage_locations)?.split(' | ') ?? [];
  const homeBin = formatOutboundStoragePath(line.sku_home_location ? [line.sku_home_location] : null);
  const allocated = Number(r.allocated_unit_count);
  // QC · pick · pack read exactly as the card face and its quick look read
  // them (`orderStage`); not done ⇒ no facts, so the row shows the assignee.
  // The pack bench is the resolver's (orderStage carries no station).
  const packStep = resolveOrdersSlotValue(line, 'orders.packed', staff);
  const stages = ORDER_STAGE_KINDS.map((kind) => orderStage(line, kind, { todayKey, staffName: getStaffName }));
  const factsFor = (kind: 'pick' | 'qc' | 'pack'): CompoundStageStepFacts | null => {
    const stage = stages.find((candidate) => candidate.kind === kind);
    if (!stage) return null;
    if (!stage.done) return null;
    const station = stage.kind === 'pack' && packStep?.kind === 'stage_event' ? packStep.station : null;
    return { who: stage.who, whoStaffId: stage.staffId, at: stage.at, station };
  };
  const pickFacts = factsFor('pick');
  const qcFacts = factsFor('qc');
  const packFacts = factsFor('pack');
  // QC assignee = the tech on the allocated unit's origin receiving line
  // (`qc_assignee_*`); a commit shows at once until the feed carries it.
  const qcStage = stages.find((stage) => stage.kind === 'qc')!;
  const [qcPending, setQcPending] = useState<{ wire: number | null; id: number | null; name: string | null } | null>(null);
  const qcAssignee =
    qcPending && qcPending.wire === qcStage.staffId ? { id: qcPending.id, name: qcPending.name } : { id: qcStage.staffId, name: qcStage.who };
  const commitQcAssignee = (id: number | null, name: string | null) => {
    const wire = qcStage.staffId;
    setQcPending({ wire, id, name });
    patchOrderQcAssignee(Number(line.id), id)
      .then(() => refreshDomain('orders.outbound'))
      .catch((e) => {
        setQcPending(null);
        toast.error(e instanceof Error ? e.message : 'Could not assign QC');
      });
  };
  const bench = String(r.pack_location_name ?? '').trim() || null;
  // Pre-box (`PREBOX_FACTS_LATERAL`): known only when the line maps to a live
  // allocated serial unit; with none, the line paints no pre-box row at all.
  const preboxUnits = Number(line.prebox_unit_count) || 0;
  const preboxed = Number(line.pre_boxed_count) || 0;
  const preboxAt = line.pre_boxed_at ? formatMonthDayTimePST(line.pre_boxed_at) : null;
  const scanOutFacts = stageFacts(resolveOrdersSlotValue(line, 'orders.scanned_out', staff));

  const steps: { kind: 'pick' | 'qc' | 'pack' | 'scan'; facts: CompoundStageStepFacts | null }[] = [
    { kind: 'qc', facts: qcFacts },
    { kind: 'pick', facts: pickFacts },
    { kind: 'pack', facts: packFacts },
    { kind: 'scan', facts: scanOutFacts?.at || scanOutFacts?.who ? scanOutFacts : null },
  ];
  // "Now" is the step after the furthest done one — a skipped step behind it
  // (QC on a line that went straight to pack) stays "not yet", never "now".
  const lastDone = steps.reduce((last, step, index) => (step.facts != null ? index : last), -1);
  const currentIndex = lastDone + 1;
  const stateOf = (index: number): StepState =>
    steps[index]!.facts != null ? 'done' : index === currentIndex ? 'current' : 'pending';
  const doneMeta = (facts: CompoundStageStepFacts) =>
    [facts.who && facts.who !== '---' ? `By ${facts.who}` : null, facts.at].filter(Boolean).join(' · ') || 'Complete';
  const openMeta = (assignee: string | null) =>
    assignee && assignee !== '---' ? `Assigned to ${assignee}` : 'Awaiting assignment';
  const assignAction = (kind: 'pick' | 'pack') =>
    assign ? (
      <span className={cn('block h-8', compact ? 'w-full max-w-40' : 'w-40')}>
        <LedgerStageAssign
          verb={compact ? 'Assign' : kind === 'pick' ? 'Pick' : 'Pack'}
          doneVerb={kind === 'pick' ? 'Picked' : 'Packed'}
          role={kind === 'pick' ? 'technician' : 'packer'}
          facts={null}
          selectedStaffId={kind === 'pick' ? staff.pickerId : staff.packerId}
          assignedName={kind === 'pick' ? staff.pickerDisplay : staff.packerDisplay}
          onCommit={(id, name) => commits.handleCommitStageAssign(line, kind === 'pick' ? 'orders.picked' : 'orders.packed', id, name)}
        />
      </span>
    ) : undefined;
  // QC is assigned on the unit, so it needs a unit allocated to the line.
  const qcAssignAction =
    assign && Number.isFinite(allocated) && allocated > 0 ? (
      <span className={cn('block h-8', compact ? 'w-full max-w-40' : 'w-40')}>
        <LedgerStageAssign
          verb={compact ? 'Assign' : 'QC'}
          doneVerb="QC'd"
          role="all"
          facts={null}
          selectedStaffId={qcAssignee.id}
          assignedName={qcAssignee.name ?? '---'}
          onCommit={commitQcAssignee}
        />
      </span>
    ) : undefined;

  const rail: RailStep[] = [
    {
      id: 'qc',
      icon: <ShieldCheck aria-hidden />,
      state: stateOf(0),
      tone: 'warning',
      title: qcFacts ? 'QC complete' : 'QC',
      meta: qcFacts ? doneMeta(qcFacts) : openMeta(qcAssignee.name),
      action: qcFacts || compact ? undefined : qcAssignAction,
      testId: 'order-record-qc',
      children: (
        <>
          {compact && !qcFacts ? qcAssignAction : null}
          {!compact ? <OrderPhotoStrip orderId={Number(line.id)} sources={TESTING_PHOTO_SOURCES} /> : null}
        </>
      ),
    },
    {
      id: 'pick',
      icon: <PackageSearch aria-hidden />,
      state: stateOf(1),
      tone: LIFECYCLE.picked.tone,
      title: pickFacts ? 'Picked' : 'Pick',
      meta: pickFacts ? doneMeta(pickFacts) : openMeta(staff.pickerDisplay),
      action: pickFacts || compact ? undefined : assignAction('pick'),
      testId: 'order-record-step-pick',
      children: (
        <>
          {compact && !pickFacts ? assignAction('pick') : null}
          {!compact && locationPaths.length > 1 ? (
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              Bins <span className={cn(RECORD_ID_CLASS, 'text-mode-ink')}>{locationPaths.join(' · ')}</span>
            </span>
          ) : null}
          {!compact ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>SKU home bin</span>
              <span className={cn(RECORD_ID_CLASS, 'shrink-0', homeBin ? 'text-mode-ink' : 'text-mode-warn')}>{homeBin ?? 'None'}</span>
              <span className="block h-8 min-w-0 flex-1">
                <LedgerSkuBinPicker sku={sku} current={homeBin} onCommit={(barcode) => commits.handleCommitSkuBin(line, barcode)} />
              </span>
            </span>
          ) : null}
        </>
      ),
    },
    {
      id: 'pack',
      icon: <Package aria-hidden />,
      state: stateOf(2),
      tone: LIFECYCLE.packed.tone,
      title: packFacts ? 'Packed' : 'Pack',
      meta: packFacts ? [doneMeta(packFacts), packFacts.station].filter(Boolean).join(' · ') : openMeta(staff.packerDisplay),
      action: packFacts || compact ? undefined : assignAction('pack'),
      testId: 'order-record-step-pack',
      children: (
        <>
          {compact && !packFacts ? assignAction('pack') : null}
          {!compact && preboxUnits > 0 ? (
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')} data-testid="order-record-prebox" data-prebox={preboxed > 0 ? 'yes' : 'no'}>
              {preboxed > 0
                ? [
                    preboxed < preboxUnits ? `Pre-boxed ${preboxed} of ${preboxUnits}` : 'Pre-boxed',
                    line.pre_boxed_by_name?.trim() || null,
                    preboxAt,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Not pre-boxed'}
            </span>
          ) : null}
          {!compact && bench ? <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Bench {bench}</span> : null}
          {!compact ? <OrderPhotoStrip orderId={Number(line.id)} sources={PACKING_PHOTO_SOURCES} /> : null}
        </>
      ),
    },
    {
      id: 'scan',
      icon: <Truck aria-hidden />,
      state: stateOf(3),
      tone: LIFECYCLE.shipped.tone,
      title: steps[3]!.facts ? 'Scanned out' : 'Scan out',
      meta: steps[3]!.facts ? doneMeta(steps[3]!.facts) : 'Not yet',
      testId: 'order-record-scanned-out',
    },
  ];

  return (
    <div className="border-b border-mode-fact px-4 py-3 last:border-b-0" data-testid="order-record-stages">
      {named ? <p className="mb-2 truncate text-role-caption font-semibold text-mode-ink">{lineTitle(line, todayKey) || '—'}</p> : null}
      <StepRail
        steps={rail}
        size="lg"
        label="Fulfillment steps"
        orientation={compact ? 'horizontal' : 'vertical'}
      />
    </div>
  );
}
