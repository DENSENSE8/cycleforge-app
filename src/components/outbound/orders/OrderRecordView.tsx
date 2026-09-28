'use client';

/**
 * The outbound ORDER RECORD — one record view for every desk that shares the industrial ledger (To Ship, Pending, Exceptions, the Search…
 * when the staffer chooses fullscreen (owner 2026-09-25,
 * (`OrderRecordActionStrip`, owner 2026-09-25).
 */

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getTrackingUrl, getTrackingUrlByCarrier } from '@/lib/tracking-format';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import {
  daysLateOn,
  queueRowStaff,
  type OrdersQueueCommits,
} from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
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
import { Button } from '@/design-system/primitives';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { formatCurrency } from '@/utils/_number';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { initials, recordState, worstState } from './outbound-orders-ledger-state';
import { StepRail, type RailStep, type StepState } from '@/design-system/components/record-ledger/StepRail';
import { Boxes, Package, ShieldCheck, Truck } from '@/components/Icons';
import {
  LedgerCondition,
  LedgerOpenAction,
  LedgerPlatformPicker,
  LedgerSkuBinPicker,
  LedgerCopyAction,
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
import { OrderLineStock } from './facts/OrderLineStock';
import { DuplicateOrderBanner } from './facts/DuplicateOrderBanner';

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
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="order-record-title">
      <span className="shrink-0">Order</span>
      <OrderAdminLinkAction
        orderId={face}
        href={orderAdminUrl(orderId, record.account_source ?? null, record.admin_url)}
        storedUrl={String(record.admin_url ?? '').trim() || null}
        ids={orderLines(record, records).map((line) => Number(line.id))}
      >
        <span className="min-w-0 truncate">{orderId || String(record.id)}</span>
      </OrderAdminLinkAction>
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
  const spec = LIFECYCLE[state];
  const worst = lines.find((line) => recordState(line) === state) ?? record;
  const next = ordersCompoundView(worst, { stateLabel: null, delayDays: null, todayKey: '' }).nextStep ?? null;
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="order-record-status">
      <LifecycleCode state={state} srLabel={null}>
        {spec.code} · {spec.label}
      </LifecycleCode>
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

  const left = (
    <div className="flex flex-col gap-4 industrial:gap-0">
      {/* A second order from the same buyer for the same SKU — caught before it ships twice. */}
      <DuplicateOrderBanner orderId={Number(record.id)} />
      {shows.has('resolve') && resolve ? <div className={COLUMN_CLASS}>{resolve}</div> : null}
      {shows.has('item') ? (
        <RecordGroup title={multi ? `Items · ${lines.length}` : 'Item'} titleHidden={!multi} testId="order-record-items">
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
          {shows.has('facts') ? (
            <div className="px-4 empty:hidden" data-testid="order-record-item-facts">
              <OrderPoLinksRow orderId={Number(record.id)} />
            </div>
          ) : null}
        </RecordGroup>
      ) : null}
      {/* Payment — the money's detail, one disclosure under the items (the
          line prices read on the items). Off the Floor rail: price is noise
          during pick and pack (owner 2026-09-24). */}
      {shows.has('price') ? (
        <div className={cn(COLUMN_CLASS, 'industrial:hidden')} data-testid="order-record-price">
          <OrderPriceEvidence orderId={record.id} />
        </div>
      ) : null}
      {shows.has('stages') ? (
        <RecordGroup title="Fulfilment" testId="order-record-chain">
          {lines.map((line) => (
            <OrderLineFulfilment key={line.id} {...lineProps(line)} assign={shows.has('assign')} named={multi} />
          ))}
        </RecordGroup>
      ) : null}
      {shows.has('buyer-note') || shows.has('note') ? (
        <RecordGroup title="Notes" testId="order-record-notes">
          {/* The buyer's note pinned first, then the note composer (@mentions,
              autosave) with earlier notes folded under it. Keyed by record so
              switching orders saves the old draft, then reseeds. */}
          <OrderNotesPanel
            key={record.id}
            orderId={Number(record.id)}
            buyerNote={String(record.buyer_note ?? '').trim() || null}
            accountSource={record.account_source ?? null}
            latestNote={record.notes ?? null}
            showBuyerNote={shows.has('buyer-note')}
            showNote={shows.has('note')}
          />
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
      {/* The timeline is its own card (owner 2026-09-27), titled by `OrderTimelineSection`. */}
      {shows.has('timeline') ? (
        <section className={cn(COLUMN_CLASS, 'empty:hidden')} data-testid="order-record-timeline" aria-label="Timeline">
          <OrderTimelineSection key={record.id} orderId={Number(record.id)} flush initialLimit={5} />
        </section>
      ) : null}
    </div>
  );

  // Details are for reading; the record's other actions sit BELOW them, the
  // same list as the top strip's ⋮ (owner 2026-09-26).
  const right = (
    <div className="flex flex-col gap-4 industrial:gap-0">
      {shows.has('customer') && buyer ? (
        <OrderCustomerGroup orderId={Number(record.id)} customer={buyer.customer} source={buyer.source} />
      ) : null}
      {shows.has('facts') || shows.has('shipment') || shows.has('label-entries') ? (
        <RecordGroup
          title="Shipping"
          testId="order-record-shipping"
          action={
            shows.has('facts') ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={editingShipping}
                onClick={() => setEditingShipping((open) => !open)}
                data-testid="order-record-shipping-edit"
              >
                {editingShipping ? 'Done' : 'Edit'}
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3 px-4 pb-3" data-testid="order-record-facts">
            {/* When: Ordered on the left, Ship by on the right — one row. */}
            {shows.has('facts') ? (
              <div className="flex min-h-8 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1" data-testid="order-record-dates">
                <span className="inline-flex min-w-0 items-baseline gap-1.5">
                  <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Ordered</span>
                  <span className="text-role-data font-medium tabular-nums text-mode-ink">{view.orderedAt?.label || '—'}</span>
                </span>
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
            {/* Where: the address reads as an address — no caption. Edit corrects
                it (a wrong address, a buyer's change call); it then wins over
                ShipStation's copy for labels (`pickOrderShipTo`). */}
            {editingShipping ? (
              <OrderShipToEditor key={record.id} orderId={Number(record.id)} customer={buyer?.customer ?? null} />
            ) : buyer ? (
              <OrderShipToRow customer={buyer.customer} />
            ) : null}
            {/* How: carrier · tracking number (the truck says what it is), carrier status under it. */}
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
                carrier={view.carrier ?? null}
                href={
                  view.tracking
                    ? (view.carrier ? getTrackingUrlByCarrier(view.tracking, view.carrier) : null) ?? getTrackingUrl(view.tracking)
                    : null
                }
                withStatus={shows.has('shipment')}
                onReplace={shows.has('facts') ? () => setReplacingTracking(true) : undefined}
              />
            ) : null}
            {/* When it lands, then the numbers it replaced — both fold away when empty. */}
            {shows.has('facts') || shows.has('shipment') ? (
              <>
                <DeliveryPromise record={record} shipByDateKey={view.delay?.dateKey ?? null} />
                <TrackingHistory orderId={Number(record.id)} current={view.tracking ?? null} />
              </>
            ) : null}
          </div>
          {shows.has('label-entries') ? <OrderLabelsSection orderId={record.id} orderRef={orderRef} /> : null}
        </RecordGroup>
      ) : null}
      {shows.has('conversation') ? (
        <div className={COLUMN_CLASS}>
          <EvidenceDisclosure key={`conversation:${record.id}`} label="Conversation" summary="Staff thread" testId="order-record-conversation" lazy>
            <ThreadPanel entityType="ORDER" entityId={Number(record.id)} dense className="min-h-0 flex-1" />
          </EvidenceDisclosure>
        </div>
      ) : null}
      {moreVerbs.length > 0 ? (
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
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink industrial:p-0" data-testid="order-record-view" data-order-view={viewKey}>
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
          <OrderRecordSummaryBar record={record} records={records} todayKey={todayKey} />
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
  const qty = Number(line.quantity);
  const units = Number.isFinite(qty) && qty > 0 ? qty : 1;
  // `orders.sale_amount` is the LINE total (unit × qty).
  const lineTotal = line.sale_amount != null && Number.isFinite(Number(line.sale_amount)) ? Number(line.sale_amount) : null;
  const locationPaths = formatOutboundStoragePath(line.storage_locations)?.split(' | ') ?? [];

  return (
    <article
      data-testid="order-record-item"
      data-current={current ? '' : undefined}
      aria-label={title || 'Item'}
      className={cn('border-b border-mode-fact', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 px-4 py-3">
        <span className="relative h-28 w-28 shrink-0 overflow-hidden rounded-mode-control border border-mode-frame bg-mode-well">
          {view.thumbUrl ? (
            <Image src={view.thumbUrl} alt="" fill unoptimized sizes="112px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-role-title font-black text-mode-muted industrial:font-mono" aria-hidden>
              {initials(title)}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-start gap-2">
            {view.titleHref ? (
              <a
                href={view.titleHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Open listing in a new tab"
                className={cn(
                  // Rest: plain title; hover / focus: the link underline (owner 2026-09-26).
                  'line-clamp-3 min-w-0 flex-1 text-role-body font-bold no-underline decoration-mode-edge underline-offset-2 hover:underline',
                  focusRing('control'),
                )}
              >
                {title || '—'}
              </a>
            ) : (
              <p className="line-clamp-3 min-w-0 flex-1 text-role-body font-bold">{title || '—'}</p>
            )}
            {/* The rule is an action, not a details row (owner 2026-09-26): a pencil on the right. */}
            {assign ? <OrderAutoAssignRuleAction record={line} records={records} getStaffName={getStaffName} /> : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-testid="order-record-item-ids">
            {/* The platform is the order's — it rides the open line only. */}
            {editFacts && current ? (
              <span className="block h-7 w-32 shrink-0" data-testid="evidence-platform">
                <LedgerPlatformPicker
                  value={view.platformValue ?? null}
                  onCommit={(accountSource) => commits.handleCommitPlatform(line, accountSource)}
                />
              </span>
            ) : null}
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{sku ?? '—'}</span>
            </span>
            {line.item_number ? (
              <span className={cn(RECORD_LABEL_CLASS, 'inline-flex items-center gap-0.5 text-mode-muted')} data-testid="evidence-listing">
                <span className="mr-1">Item</span>
                <button
                  type="button"
                  data-testid="evidence-item-paperwork"
                  title="Paperwork paired to this item number"
                  onClick={() => onOpenItemPaperwork(String(line.item_number))}
                  className={cn(
                    'ds-raw-button',
                    RECORD_ID_CLASS,
                    'normal-case tracking-normal text-mode-ink no-underline decoration-mode-edge underline-offset-2 hover:underline',
                    focusRing('control'),
                  )}
                >
                  {line.item_number}
                </button>
                {view.titleHref ? <LedgerOpenAction href={view.titleHref} label="listing" /> : null}
                {editFacts ? (
                  <ListingLinkEditor
                    face="icon"
                    currentItem={String(line.item_number).trim() || null}
                    targets={[{ id: Number(line.id), itemNumber: line.item_number ?? null, accountSource: line.account_source ?? null }]}
                  />
                ) : null}
                <LedgerCopyAction value={String(line.item_number).trim() || null} label="item number" />
              </span>
            ) : editFacts ? (
              <ListingLinkEditor
                face="label"
                currentItem={null}
                targets={[{ id: Number(line.id), itemNumber: null, accountSource: line.account_source ?? null }]}
              />
            ) : null}
          </div>
          {/* Qty · Condition · Bin — one line (owner 2026-09-27). */}
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
            <span className="inline-flex min-w-0 items-center gap-2" data-testid="evidence-location">
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Bin</span>
              <span className={cn(RECORD_ID_CLASS, 'min-w-0 truncate', locationPaths[0] ? 'text-mode-ink' : 'text-mode-warn')}>
                {locationPaths[0] ?? 'Unassigned'}
              </span>
              {locationPaths.length > 1 ? (
                <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>+{locationPaths.length - 1}</span>
              ) : null}
            </span>
            {/* On hand · allocated, with Allocate when units are free (pick-relevant: stays on the Floor). */}
            <OrderLineStock line={line} />
            <span
              className={cn('ml-auto inline-flex shrink-0 items-baseline gap-1.5', !priceOnFloor && 'industrial:hidden')}
              data-testid="evidence-item-price"
            >
              {lineTotal != null && units > 1 ? (
                <span className="text-role-caption tabular-nums text-mode-muted">
                  {formatCurrency(lineTotal / units)} × {units}
                </span>
              ) : null}
              <span className={cn(RECORD_PRICE_CLASS, lineTotal == null && 'text-mode-muted')}>
                {lineTotal != null ? formatCurrency(lineTotal) : '—'}
              </span>
            </span>
          </div>
          {/* How it arrived — the receiving evidence, inline on the item. */}
          <OrderPhotoStrip orderId={Number(line.id)} sources={RECEIVED_PHOTO_SOURCES} />
        </div>
      </div>
    </article>
  );
}

/**
 * One line in the Fulfilment group (owner 2026-09-27): the ladder
 * Picked → QC → Packed → Scanned out on the shared `StepRail` — a filled node
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
}: OrderLineProps & {
  /** Several lines: each block leads with its item title. */
  named: boolean;
}) {
  const r = line as QueueRowRecord;
  const staff = queueRowStaff(r, getStaffName);
  const view = ordersCompoundView(line, { stateLabel: null, delayDays: null, todayKey });
  const sku = view.detail?.sku ?? (String(line.sku ?? '').trim() || null);
  const locationPaths = formatOutboundStoragePath(line.storage_locations)?.split(' | ') ?? [];
  const homeBin = formatOutboundStoragePath(line.sku_home_location ? [line.sku_home_location] : null);
  const allocated = Number(r.allocated_unit_count);
  // Pick · QC · pack read exactly as the card face and its quick look read
  // them (`orderStage`); not done ⇒ no facts, so the row shows the assignee.
  // The pack bench is the resolver's (orderStage carries no station).
  const packStep = resolveOrdersSlotValue(line, 'orders.packed', staff);
  const stages = ORDER_STAGE_KINDS.map((kind) => orderStage(line, kind, { todayKey, staffName: getStaffName }));
  const [pickFacts, qcFacts, packFacts] = stages.map((stage): CompoundStageStepFacts | null => {
    if (!stage.done) return null;
    const station = stage.kind === 'pack' && packStep?.kind === 'stage_event' ? packStep.station : null;
    return { who: stage.who, whoStaffId: stage.staffId, at: stage.at, station };
  });
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
    { kind: 'pick', facts: pickFacts },
    { kind: 'qc', facts: qcFacts },
    { kind: 'pack', facts: packFacts },
    { kind: 'scan', facts: scanOutFacts?.at || scanOutFacts?.who ? scanOutFacts : null },
  ];
  // "Now" is the step after the furthest done one — a skipped step behind it
  // (QC on a line that went straight to pack) stays "not yet", never "now".
  const lastDone = steps.reduce((last, step, index) => (step.facts != null ? index : last), -1);
  const currentIndex = lastDone + 1;
  const stateOf = (index: number): StepState =>
    steps[index]!.facts != null ? 'done' : index === currentIndex ? 'current' : 'pending';
  const doneMeta = (facts: CompoundStageStepFacts) => [facts.who, facts.at].filter(Boolean).join(' · ') || 'Done';
  const openMeta = (assignee: string | null) => (assignee && assignee !== '---' ? `Assigned to ${assignee}` : 'Not yet');
  const assignAction = (kind: 'pick' | 'pack') =>
    assign ? (
      <span className="block h-8 w-40">
        <LedgerStageAssign
          verb={kind === 'pick' ? 'Pick' : 'Pack'}
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
      <span className="block h-8 w-40">
        <LedgerStageAssign
          verb="QC"
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
      id: 'pick',
      icon: <Boxes aria-hidden />,
      state: stateOf(0),
      title: pickFacts ? 'Picked' : 'Pick',
      meta: pickFacts ? doneMeta(pickFacts) : openMeta(staff.pickerDisplay),
      action: pickFacts ? undefined : assignAction('pick'),
      testId: 'order-record-step-pick',
      children: (
        <>
          {locationPaths.length > 1 ? (
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              Bins <span className={cn(RECORD_ID_CLASS, 'text-mode-ink')}>{locationPaths.join(' · ')}</span>
            </span>
          ) : null}
          {Number.isFinite(allocated) && allocated > 0 ? (
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              {allocated} unit{allocated === 1 ? '' : 's'} allocated
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>SKU home bin</span>
            <span className={cn(RECORD_ID_CLASS, 'shrink-0', homeBin ? 'text-mode-ink' : 'text-mode-warn')}>{homeBin ?? 'None'}</span>
            <span className="block h-8 min-w-0 flex-1">
              <LedgerSkuBinPicker sku={sku} current={homeBin} onCommit={(barcode) => commits.handleCommitSkuBin(line, barcode)} />
            </span>
          </span>
        </>
      ),
    },
    {
      id: 'qc',
      icon: <ShieldCheck aria-hidden />,
      state: stateOf(1),
      title: qcFacts ? "QC'd" : 'QC',
      meta: qcFacts ? doneMeta(qcFacts) : openMeta(qcAssignee.name),
      action: qcFacts ? undefined : qcAssignAction,
      testId: 'order-record-qc',
      children: <OrderPhotoStrip orderId={Number(line.id)} sources={TESTING_PHOTO_SOURCES} />,
    },
    {
      id: 'pack',
      icon: <Package aria-hidden />,
      state: stateOf(2),
      title: packFacts ? 'Packed' : 'Pack',
      meta: packFacts ? [doneMeta(packFacts), packFacts.station].filter(Boolean).join(' · ') : openMeta(staff.packerDisplay),
      action: packFacts ? undefined : assignAction('pack'),
      testId: 'order-record-step-pack',
      children: (
        <>
          {preboxUnits > 0 ? (
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
          {bench ? <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Bench {bench}</span> : null}
          <OrderPhotoStrip orderId={Number(line.id)} sources={PACKING_PHOTO_SOURCES} />
        </>
      ),
    },
    {
      id: 'scan',
      icon: <Truck aria-hidden />,
      state: stateOf(3),
      title: steps[3]!.facts ? 'Scanned out' : 'Scan out',
      meta: steps[3]!.facts ? doneMeta(steps[3]!.facts) : 'Not yet',
      testId: 'order-record-scanned-out',
    },
  ];

  return (
    <div className="border-b border-mode-fact px-4 py-3 last:border-b-0" data-testid="order-record-stages">
      {named ? <p className="mb-2 truncate text-role-caption font-semibold text-mode-ink">{lineTitle(line, todayKey) || '—'}</p> : null}
      <StepRail steps={rail} size="lg" label="Fulfilment steps" />
    </div>
  );
}
