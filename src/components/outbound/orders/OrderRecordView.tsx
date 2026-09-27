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
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
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
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { orderAdminUrl } from '@/utils/order-platform';
import { ListingLinkEditor, OrderAdminLinkAction } from './order-link-editors';
import { formatMonthDayTimePST } from '@/utils/date';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { EvidenceDisclosure, EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import {
  ORDER_RECORD_SECTIONS,
  type OrderRecordMode,
  type OrderRecordSectionId,
} from '@/lib/selection-context/order-inspector-context';
import { OrderPriceEvidence } from './OrderPriceEvidence';
import { OrderAutoAssignRuleAction } from './OrderAutoAssignRuleAction';
import { useOrderRecordMoreVerbs } from './to-ship/MorphingRowActionMenu';
import { subscribeOpenOrderPaperwork } from '@/utils/events';
import {
  OrderCarrierRows,
  OrderCustomerRows,
  OrderLabelsSection,
  OrderShipToRow,
  orderBuyer,
} from './order-record-sections';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { formatCurrency } from '@/utils/_number';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { initials, recordState } from './outbound-orders-ledger-state';
import {
  LedgerCondition,
  LedgerListingLink,
  LedgerPlatformPicker,
  LedgerSkuBinPicker,
  LedgerTrackingReplace,
  LedgerOpenAction,
  LedgerCopyAction,
  LedgerQty,
  LedgerShipBy,
  LedgerStageAssign,
  LedgerNoteField,
  stageFacts,
} from './outbound-orders-ledger-editors';
import { LEDGER_HIT_CLASS } from './outbound-orders-ledger-geometry';
import { PaperworkPanel, type PaperworkTab } from './paperwork/PaperworkDocuments';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { OrderPhotoPeek } from './OrderPhotoPeek';

/** One column of the record: the industrial panel its sections stack in. */
const COLUMN_CLASS = DESK_RECORD_COLUMN_CARD_CLASS;

interface OrderRecordViewProps {
  /** The desk this record opens on — decides which sections paint. */
  mode: OrderRecordMode;
  /** The open record (live row). */
  record: ShippedOrder;
  /** The painted queue — the order's other lines, and every order the rule editor assigns. */
  records: readonly ShippedOrder[];
  todayKey: string;
  getStaffName: (id: number) => string;
  commits: OrdersQueueCommits;
  /** The desk's own job for this order, painted at the mode's `resolve` section (Exceptions: the SKU pairing form). */
  resolve?: ReactNode;
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
        <span className="min-w-0 truncate">{orderId || `#${record.id}`}</span>
      </OrderAdminLinkAction>
    </span>
  );
}

export function OrderRecordView({
  mode,
  record,
  records,
  todayKey,
  getStaffName,
  commits,
  resolve,
}: OrderRecordViewProps) {
  const shows = new Set<OrderRecordSectionId>(ORDER_RECORD_SECTIONS[mode]);
  const r = record as QueueRowRecord;
  const state = recordState(record);
  const spec = LIFECYCLE[state];
  const view = ordersCompoundView(record, {
    stateLabel: null,
    delayDays: daysLateOn(
      todayKey,
      (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
    ),
    todayKey,
  });
  const orderId = view.orderId ?? '';
  const orderRef = orderId || `#${record.id}`;
  const buyer = orderBuyer(record);

  // Every line of this order the queue holds, in ledger order; the open line
  // leads when the queue does not carry it (a deep link before the rows land).
  const lines = orderLines(record, records);
  const moreVerbs = useOrderRecordMoreVerbs(record, mode);

  // Paperwork opens INLINE in place of the details (owner 2026-09-26: never a
  // popover); Back returns. A new record always opens on its details.
  const [paperwork, setPaperwork] = useState<{ tab: PaperworkTab; itemNumber: string | null; orderId: number } | null>(null);
  const [openVerbId, setOpenVerbId] = useState<string | null>(null);
  const openVerb = moreVerbs.find((verb) => verb.id === openVerbId) ?? null;
  useEffect(() => {
    setPaperwork(null);
    setOpenVerbId(null);
  }, [record.id]);
  // The Paperwork action (top strip ⋮ or More actions) opens it here.
  useEffect(
    () =>
      subscribeOpenOrderPaperwork((orderId) => {
        if (orderId === Number(record.id)) setPaperwork({ tab: 'shipping_label', itemNumber: null, orderId });
      }),
    [record.id],
  );

  // ── F-pattern groups (owner 2026-09-27) ────────────────────────────────────
  // Left, the work:  Items → Fulfilment → Notes → Documents → Timeline.
  // Right, the facts: Customer → Shipping → Price → Conversation → More actions.
  // Each group is one `RecordGroup` (title top-left, ≤1 action top-right); the
  // order number reads once, in the record header (`OrderRecordTitle`).
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
      {shows.has('resolve') && resolve ? <div className={COLUMN_CLASS}>{resolve}</div> : null}
      {shows.has('item') ? (
        <RecordGroup
          title={multi ? `Items · ${lines.length}` : 'Item'}
          testId="order-record-items"
          action={shows.has('state') ? <LifecycleCode state={state} srLabel={null}>{spec.code} · {spec.label}</LifecycleCode> : undefined}
        >
          {lines.map((line) => (
            <OrderItem
              key={line.id}
              {...lineProps(line)}
              assign={shows.has('assign')}
              showPrice={!shows.has('price')}
              onOpenItemPaperwork={(itemNumber) => setPaperwork({ tab: 'manual', itemNumber, orderId: Number(line.id) })}
            />
          ))}
          {shows.has('facts') ? (
            <div className="flex flex-col px-4" data-testid="order-record-item-facts">
              <EvidenceFactRow label="Platform">
                <span className="flex h-8 min-w-0 items-center" data-testid="evidence-platform">
                  <span className="min-w-0 flex-1">
                    <LedgerPlatformPicker
                      value={view.platformValue ?? null}
                      onCommit={(accountSource) => commits.handleCommitPlatform(record, accountSource)}
                    />
                  </span>
                </span>
              </EvidenceFactRow>
              {/* The listing link opens (it is the value); copy is the row's
                  secondary action, far right on the ↗ / ✎ axis (owner 2026-09-26). */}
              <EvidenceFactRow label="Listing">
                <span className="flex min-w-0 flex-1 items-center">
                  <span className="block h-8 min-w-0 flex-1">
                    <LedgerListingLink href={view.titleHref ?? null} itemNumber={record.item_number ?? null} face="value" />
                  </span>
                  <ListingLinkEditor
                    face="icon"
                    currentItem={String(record.item_number ?? '').trim() || null}
                    targets={[{ id: Number(record.id), itemNumber: record.item_number ?? null, accountSource: record.account_source ?? null }]}
                  />
                  <LedgerCopyAction value={String(record.item_number ?? '').trim() || null} label="item number" />
                </span>
              </EvidenceFactRow>
            </div>
          ) : null}
        </RecordGroup>
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
          {shows.has('buyer-note') ? <BuyerNoteBlock note={String(record.buyer_note ?? '').trim() || null} /> : null}
          {shows.has('note') ? (
            // The latest face of the `order_notes` trail, edited in place and
            // autosaved (the same field the row's NOTE badge opens). Keyed by
            // record so switching orders saves the old draft, then reseeds.
            <div className="px-4 pb-3 pt-1">
              <LedgerNoteField key={record.id} label="Order note" orderId={Number(record.id)} note={record.notes ?? null} />
            </div>
          ) : null}
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
        <section className={COLUMN_CLASS} data-testid="order-record-timeline" aria-label="Timeline">
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
        <RecordGroup title="Customer" testId="order-record-customer">
          <OrderCustomerRows customer={buyer.customer} source={buyer.source} />
        </RecordGroup>
      ) : null}
      {shows.has('facts') || shows.has('shipment') || shows.has('label-entries') ? (
        <RecordGroup title="Shipping" testId="order-record-shipping">
          <div className="flex flex-col px-4" data-testid="order-record-facts">
            {buyer ? <OrderShipToRow customer={buyer.customer} /> : null}
            {shows.has('shipment') ? <OrderCarrierRows record={record} /> : null}
            {shows.has('facts') ? (
              <>
                <EvidenceFactRow label="Tracking #">
                  <span className="flex min-w-0 flex-1 items-center" data-testid="evidence-tracking-chip">
                    <span className="flex min-w-0 flex-1 items-center">
                      {view.tracking ? (
                        <RecordFullId value={view.tracking} label="tracking number" />
                      ) : (
                        <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>Not attached</span>
                      )}
                    </span>
                    <LedgerTrackingReplace
                      current={view.tracking ?? null}
                      onCommit={(tracking) => commits.handleCommitTracking(record, tracking)}
                    />
                    <LedgerOpenAction
                      href={
                        view.tracking
                          ? (view.carrier ? getTrackingUrlByCarrier(view.tracking, view.carrier) : null) ??
                            getTrackingUrl(view.tracking)
                          : null
                      }
                      label="tracking number"
                    />
                  </span>
                </EvidenceFactRow>
                <EvidenceFactRow label="Ship by">
                  <span className="-ml-2 block h-8">
                    <LedgerShipBy
                      dateKey={view.delay?.dateKey ?? null}
                      overdueDays={view.delay?.overdue ? view.delay.days : 0}
                      dueToday={Boolean(view.delay?.dueToday)}
                      tip={view.delayTip}
                      onCommit={(key) => commits.handleCommitShipBy(record, key)}
                    />
                  </span>
                </EvidenceFactRow>
                <EvidenceFactRow label="Ordered">
                  <span className={RECORD_ID_CLASS}>{view.orderedAt?.label || '—'}</span>
                </EvidenceFactRow>
              </>
            ) : null}
          </div>
          {shows.has('label-entries') ? <OrderLabelsSection orderId={record.id} orderRef={orderRef} /> : null}
        </RecordGroup>
      ) : null}
      {shows.has('price') ? (
        <div className={COLUMN_CLASS}>
          <OrderPriceEvidence orderId={record.id} />
        </div>
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
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink industrial:p-0" data-testid="order-record-view" data-order-record-mode={mode}>
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
        <DeskRecordLayout main={left} aside={right} peek={<OrderPhotoPeek key={record.id} orderId={Number(record.id)} />} />
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
 * One line in the Items group: photo · title · SKU + item # · one facts row
 * **Qty · Condition · Bin** (owner 2026-09-27). Price lives in the Price group
 * — only a desk without one (Exceptions) keeps the line's sale price here;
 * who handled it lives in Fulfilment.
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
  showPrice,
}: OrderLineProps & {
  /** The item number's paperwork, inline in the record. */
  onOpenItemPaperwork: (itemNumber: string) => void;
  /** The desk paints no Price group, so the line carries its sale price. */
  showPrice: boolean;
}) {
  const view = ordersCompoundView(line, { stateLabel: null, delayDays: null, todayKey });
  const title = lineTitle(line, todayKey);
  const sku = view.detail?.sku ?? (String(line.sku ?? '').trim() || null);
  const qty = Number(line.quantity);
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
          <p className={cn(RECORD_LABEL_CLASS, 'flex flex-wrap items-baseline gap-x-3 text-mode-muted')}>
            <span>
              SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{sku ?? '—'}</span>
            </span>
            {line.item_number ? (
              <span>
                Item{' '}
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
              </span>
            ) : null}
          </p>
          {/* Qty · Condition · Bin — one line (owner 2026-09-27). */}
          <div className="flex flex-wrap items-center gap-3" data-testid="order-record-item-facts-row">
            <span className="inline-flex h-8 items-center gap-2">
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Qty</span>
              <span className="block h-8 w-20">
                <LedgerQty
                  bare
                  value={Number.isFinite(qty) && qty > 0 ? qty : 1}
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
          </div>
          {showPrice ? (
            <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')} data-testid="evidence-item-price">
              Price{' '}
              <span className={cn(RECORD_PRICE_CLASS, 'normal-case tracking-normal')}>
                {line.sale_amount != null && Number.isFinite(Number(line.sale_amount)) ? formatCurrency(Number(line.sale_amount)) : '—'}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * One line in the Fulfilment group (owner 2026-09-27): **Packed by** and
 * **Scanned out by** always read; picked · QC · pre-box · bench and the bin
 * detail (every path, allocation, SKU home bin + set) fold behind one
 * "More details", closed by default.
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
  const [pickFacts, qcFacts, packFacts] = ORDER_STAGE_KINDS.map((kind): CompoundStageStepFacts | null => {
    const stage = orderStage(line, kind, { todayKey, staffName: getStaffName });
    if (!stage.done) return null;
    const station = kind === 'pack' && packStep?.kind === 'stage_event' ? packStep.station : null;
    return { who: stage.who, whoStaffId: stage.staffId, at: stage.at, station };
  });
  const bench = String(r.pack_location_name ?? '').trim() || null;
  // Pre-box (`PREBOX_FACTS_LATERAL`): known only when the line maps to a live
  // allocated serial unit; with none, the line paints no pre-box row at all.
  const preboxUnits = Number(line.prebox_unit_count) || 0;
  const preboxed = Number(line.pre_boxed_count) || 0;
  const preboxAt = line.pre_boxed_at ? formatMonthDayTimePST(line.pre_boxed_at) : null;
  const scanOutFacts = stageFacts(resolveOrdersSlotValue(line, 'orders.scanned_out', staff));

  return (
    <div className="border-b border-mode-fact last:border-b-0" data-testid="order-record-stages">
      {named ? (
        <p className="truncate px-4 pt-2 text-role-caption font-semibold text-mode-ink">{lineTitle(line, todayKey) || '—'}</p>
      ) : null}
      <div className="flex flex-col px-4" data-testid="order-record-stages-chain">
        <EvidenceFactRow label="Packed by">
          <LedgerStageAssign
            verb="Pack"
            doneVerb="Packed"
            role="packer"
            facts={packFacts}
            selectedStaffId={staff.packerId}
            assignedName={staff.packerDisplay}
            onCommit={assign ? (id, name) => commits.handleCommitStageAssign(line, 'orders.packed', id, name) : undefined}
            showStamp
          />
        </EvidenceFactRow>
        <EvidenceFactRow label="Scanned out by">
          <span data-testid="order-record-scanned-out">
            <LedgerStageAssign
              verb="Scan out"
              doneVerb="Scanned out"
              role="packer"
              facts={scanOutFacts}
              selectedStaffId={null}
              assignedName="---"
              showStamp
            />
          </span>
        </EvidenceFactRow>
      </div>
      <EvidenceDisclosure label="More details" summary={null} testId="order-record-more-details">
        <div className="flex flex-col px-4">
          <EvidenceFactRow label="Picked by">
            <LedgerStageAssign
              verb="Pick"
              doneVerb="Picked"
              role="technician"
              facts={pickFacts}
              selectedStaffId={staff.pickerId}
              assignedName={staff.pickerDisplay}
              onCommit={assign ? (id, name) => commits.handleCommitStageAssign(line, 'orders.picked', id, name) : undefined}
              showStamp
            />
          </EvidenceFactRow>
          <EvidenceFactRow label="QC by">
            <span data-testid="order-record-qc">
              <LedgerStageAssign
                verb="QC"
                doneVerb="QC'd"
                role="technician"
                facts={qcFacts}
                selectedStaffId={null}
                assignedName="---"
                showStamp
              />
            </span>
          </EvidenceFactRow>
          {preboxUnits > 0 ? (
            <EvidenceFactRow label="Pre-boxed">
              <span data-testid="order-record-prebox" data-prebox={preboxed > 0 ? 'yes' : 'no'}>
                {preboxed > 0 ? (
                  <LedgerStageAssign
                    verb="Pre-box"
                    doneVerb={preboxed < preboxUnits ? `Pre-boxed ${preboxed} of ${preboxUnits}` : 'Pre-boxed'}
                    role="packer"
                    facts={{ who: line.pre_boxed_by_name?.trim() || null, whoStaffId: null, at: preboxAt, station: null }}
                    selectedStaffId={null}
                    assignedName="---"
                    showStamp
                  />
                ) : (
                  <span className={cn('flex items-center px-1', LEDGER_HIT_CLASS, RECORD_LABEL_CLASS, 'text-mode-muted')}>
                    Not pre-boxed
                  </span>
                )}
              </span>
            </EvidenceFactRow>
          ) : null}
          {bench ? (
            <EvidenceFactRow label="Pack bench">
              <span className={RECORD_LABEL_CLASS}>{bench}</span>
            </EvidenceFactRow>
          ) : null}
          {locationPaths.length > 1 ? (
            <EvidenceFactRow label="Bins" wide>
              {locationPaths.map((path) => (
                <span key={path} className={cn(RECORD_ID_CLASS, 'block break-words text-mode-ink')}>{path}</span>
              ))}
            </EvidenceFactRow>
          ) : null}
          {Number.isFinite(allocated) && allocated > 0 ? (
            <EvidenceFactRow label="Allocated">
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-ink')}>
                {allocated} unit{allocated === 1 ? '' : 's'}
              </span>
            </EvidenceFactRow>
          ) : null}
          <EvidenceFactRow label="SKU home bin">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn(RECORD_ID_CLASS, 'shrink-0', homeBin ? 'text-mode-ink' : 'text-mode-warn')}>{homeBin ?? 'None'}</span>
              <span className="block h-8 min-w-0 flex-1">
                <LedgerSkuBinPicker sku={sku} current={homeBin} onCommit={(barcode) => commits.handleCommitSkuBin(line, barcode)} />
              </span>
            </span>
          </EvidenceFactRow>
        </div>
      </EvidenceDisclosure>
    </div>
  );
}
