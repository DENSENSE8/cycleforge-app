'use client';

/**
 * The outbound ORDER RECORD — one record view for every desk that shares the industrial ledger (To Ship, Pending, Exceptions, the Search…
 * when the staffer chooses fullscreen (owner 2026-09-25,
 * (`OrderRecordActionStrip`, owner 2026-09-25).
 */

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getTrackingUrl, getTrackingUrlByCarrier } from '@/lib/tracking-format';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
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
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { formatMonthDayTimePST } from '@/utils/date';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { formatCurrency } from '@/utils/_number';
import {
  EvidenceFactDisclosure,
  EvidenceFactRow,
} from '@/design-system/components/record-ledger/EvidenceDisclosure';
import {
  ORDER_RECORD_SECTIONS,
  type OrderRecordMode,
  type OrderRecordSectionId,
} from '@/lib/selection-context/order-inspector-context';
import { OrderPriceEvidence } from './OrderPriceEvidence';
import { OrderAutoAssignRuleLine } from './OrderAutoAssignRuleLine';
import {
  OrderCustomerSection,
  OrderLabelsSection,
  OrderShipmentSection,
  orderBuyer,
} from './order-record-sections';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_PRICE_CLASS,
  stateBadgeClass,
} from '@/design-system/tokens/industrial-record';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { initials, recordState } from './outbound-orders-ledger-state';
import {
  LedgerCondition,
  LedgerListingLink,
  LedgerPlatformPicker,
  LedgerSkuBinPicker,
  LedgerTrackingReplace,
  LedgerOpenAction,
  LedgerQty,
  LedgerShipBy,
  LedgerStageAssign,
  LedgerNoteField,
  stageFacts,
} from './outbound-orders-ledger-editors';
import { LEDGER_HIT_CLASS } from './outbound-orders-ledger-geometry';
import { ItemPaperworkDialog } from './paperwork/PaperworkDocuments';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { ThreadPanel } from '@/components/threads/ThreadPanel';

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
  const next = view.nextStep ?? null;

  // Every line of this order the queue holds, in ledger order; the open line
  // leads when the queue does not carry it (a deep link before the rows land).
  const orderKey = String(record.order_id ?? '').trim();
  const siblings = orderKey ? records.filter((line) => String(line.order_id ?? '').trim() === orderKey) : [];
  const lines = siblings.some((line) => Number(line.id) === Number(record.id)) ? siblings : [record, ...siblings];

  const main = (
    <div className={COLUMN_CLASS}>
      {shows.has('state') ? (
        <div className={cn('flex items-center gap-2 border-b border-mode-fact px-4', LEDGER_HIT_CLASS)}>
          <LifecycleCode state={state} srLabel={null}>
            {spec.code} · {spec.label}
          </LifecycleCode>
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            {lines.length} {lines.length === 1 ? 'item' : 'items'}
          </span>
          {/* Where it goes next, as a solid badge in the record's colour
              (owner 2026-09-25); a blocked step wears the danger badge. */}
          {next ? (
            <span
              data-testid="evidence-next-step"
              className={cn(RECORD_LABEL_CLASS, 'ml-auto inline-flex h-3.5 items-center', stateBadgeClass(next.blocked ? 'danger' : spec.tone))}
              title={next.tip}
            >
              {next.label}
            </span>
          ) : null}
        </div>
      ) : null}
      {shows.has('resolve') ? resolve : null}
      {shows.has('item')
        ? lines.map((line) => (
            <OrderItem
              key={line.id}
              line={line}
              current={Number(line.id) === Number(record.id)}
              orderRef={orderRef}
              todayKey={todayKey}
              records={records}
              getStaffName={getStaffName}
              commits={commits}
              chain={shows.has('stages')}
              assign={shows.has('assign')}
            />
          ))
        : null}
      {shows.has('documents') ? (
        <section className="border-b border-mode-fact px-4 py-3" data-testid="order-record-documents" aria-label="Documents">
          <p className={cn(RECORD_LABEL_CLASS, 'mb-2 text-mode-muted')}>Documents</p>
          <OrderDocumentsSection orderId={Number(record.id)} orderRef={orderRef} readOnly showPreview={false} flush />
        </section>
      ) : null}
    </div>
  );

  const aside = (
    <div className={COLUMN_CLASS}>
      {shows.has('buyer-note') ? <BuyerNoteBlock note={String(record.buyer_note ?? '').trim() || null} /> : null}
      {shows.has('shipment') ? <OrderShipmentSection record={record} /> : null}
      {shows.has('facts') ? (
        <div className="flex flex-col border-b border-mode-fact px-4" data-testid="order-record-facts">
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
          {/* A details panel shows identifiers IN FULL (owner 2026-09-26): no
              brand dot, no last-8 chip; Copy on hover, actions to the right. */}
          <EvidenceFactRow label="Order #">
            <span className="flex min-w-0 flex-1 items-center" data-testid="evidence-order-chip">
              <span className="flex min-w-0 flex-1 items-center">
                <RecordFullId value={orderId || String(record.id)} label="order number" />
              </span>
              <LedgerOpenAction href={marketplaceOrderUrl(orderId, view.platformValue)} label="order number" />
            </span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Listing">
            <span className="block h-8">
              <LedgerListingLink href={view.titleHref ?? null} itemNumber={record.item_number ?? null} face="value" />
            </span>
          </EvidenceFactRow>
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
        </div>
      ) : null}
      {shows.has('customer') && buyer ? <OrderCustomerSection customer={buyer.customer} source={buyer.source} /> : null}
      {shows.has('labels') ? (
        <OrderLabelsSection orderId={record.id} orderRef={orderRef} entries={shows.has('label-entries')} />
      ) : null}
      {shows.has('price') ? <OrderPriceEvidence orderId={record.id} /> : null}
      {shows.has('note') ? (
        // The latest face of the `order_notes` trail, edited in place and
        // autosaved (the same field the row's NOTE badge opens). Keyed by
        // record so switching orders saves the old draft, then reseeds.
        <div className="border-b border-mode-fact px-4 py-2">
          <LedgerNoteField key={record.id} label="Order note" orderId={Number(record.id)} note={record.notes ?? null} />
        </div>
      ) : null}
      {shows.has('conversation') ? (
        <section className="flex flex-col border-b border-mode-fact" data-testid="order-record-conversation" aria-label="Conversation">
          <p className={cn(RECORD_LABEL_CLASS, 'px-4 pt-3 text-mode-muted')}>Conversation</p>
          <ThreadPanel entityType="ORDER" entityId={Number(record.id)} dense className="min-h-0 flex-1" />
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="order-record-view" data-order-record-mode={mode}>
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}

/** One line of the order: */
function OrderItem({
  line,
  current,
  orderRef,
  todayKey,
  records,
  getStaffName,
  commits,
  chain,
  assign,
}: {
  line: ShippedOrder;
  current: boolean;
  orderRef: string;
  todayKey: string;
  records: readonly ShippedOrder[];
  getStaffName: (id: number) => string;
  commits: OrdersQueueCommits;
  chain: boolean;
  /** The chain's Pick / Pack popovers and the auto-assign rule line (work still to do). */
  assign: boolean;
}) {
  const r = line as QueueRowRecord;
  const staff = queueRowStaff(r, getStaffName);
  const view = ordersCompoundView(line, { stateLabel: null, delayDays: null, todayKey });
  const title =
    resolveSkuIdentityTitle({
      zoho_item_title: typeof r.zoho_item_title === 'string' ? r.zoho_item_title : null,
      catalog_product_title: line.product_title,
      sku: line.sku,
    }) || view.title;
  const sku = view.detail?.sku ?? (String(line.sku ?? '').trim() || null);
  const amount = Number(line.sale_amount);
  const qty = Number(line.quantity);
  const locationPaths = formatOutboundStoragePath(line.storage_locations)?.split(' | ') ?? [];
  const homeBin = formatOutboundStoragePath(line.sku_home_location ? [line.sku_home_location] : null);
  const allocated = Number(r.allocated_unit_count);
  const pickFacts = stageFacts(resolveOrdersSlotValue(line, 'orders.picked', staff));
  const packFacts = stageFacts(resolveOrdersSlotValue(line, 'orders.packed', staff));
  // QC: the tech-station verdict (`tested_by_name` · `test_activity_at` on the
  // feed) — a different verb from the pick scan, never folded into it.
  const qcWho = typeof r.tested_by_name === 'string' ? r.tested_by_name.trim() || null : null;
  const qcAt = typeof r.test_activity_at === 'string' ? formatMonthDayTimePST(r.test_activity_at) : null;
  const qcId = Number(r.tested_by) > 0 ? Number(r.tested_by) : null;
  const bench = String(r.pack_location_name ?? '').trim() || null;
  // Pre-box (`PREBOX_FACTS_LATERAL`): known only when the line maps to a live
  // allocated serial unit; with none, the line paints no pre-box row at all.
  const preboxUnits = Number(line.prebox_unit_count) || 0;
  const preboxed = Number(line.pre_boxed_count) || 0;
  const preboxAt = line.pre_boxed_at ? formatMonthDayTimePST(line.pre_boxed_at) : null;
  const [paperworkOpen, setPaperworkOpen] = useState(false);

  return (
    <article
      data-testid="order-record-item"
      data-current={current ? '' : undefined}
      aria-label={title || 'Item'}
      className={cn('border-b border-mode-fact', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 p-3">
        <span className="relative h-28 w-28 shrink-0 overflow-hidden border border-mode-frame bg-mode-well">
          {view.thumbUrl ? (
            <Image src={view.thumbUrl} alt="" fill unoptimized sizes="112px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-role-title font-black text-mode-muted" aria-hidden>
              {initials(title)}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {view.titleHref ? (
            <a
              href={view.titleHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open listing in a new tab"
              className={cn(
                // Rest: plain title; hover / focus: the link underline (owner 2026-09-26).
                'line-clamp-3 text-role-body font-bold no-underline decoration-mode-edge underline-offset-2 hover:underline',
                focusRing('control'),
              )}
            >
              {title || '—'}
            </a>
          ) : (
            <p className="line-clamp-3 text-role-body font-bold">{title || '—'}</p>
          )}
          {/* Hierarchy (owner 2026-09-26): title · SKU + item # · qty + condition · price. */}
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
                  onClick={() => setPaperworkOpen(true)}
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
          <div className="flex flex-wrap items-center gap-3">
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
            <a
              href={sku ? `/inventory?sku=${encodeURIComponent(sku)}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!sku}
              data-testid="evidence-sku-stock"
              className={cn(DESK_BAR_SEGMENT_CLASS, 'rounded-mode-control border border-mode-edge', deskBarSegmentTone(false), !sku && 'pointer-events-none opacity-40')}
            >
              SKU stock ↗
            </a>
          </div>
          <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')} data-testid="evidence-price">
            Price{' '}
            <span className={cn(RECORD_PRICE_CLASS, 'normal-case tracking-normal')}>
              {line.sale_amount != null && Number.isFinite(amount) ? formatCurrency(amount) : '—'}
            </span>
          </p>
          {line.item_number ? (
            <ItemPaperworkDialog
              open={paperworkOpen}
              onOpenChange={setPaperworkOpen}
              orderId={line.id}
              orderRef={orderRef}
              itemNumber={line.item_number}
            />
          ) : null}
        </div>
      </div>
      <div className="flex flex-col px-4" data-testid="order-record-stages">
        <EvidenceFactDisclosure
          label="Bin"
          testId="evidence-location"
          value={
            <>
              <span className={cn(RECORD_ID_CLASS, 'min-w-0 truncate', locationPaths[0] ? 'text-mode-ink' : 'text-mode-warn')}>
                {locationPaths[0] ?? 'Unassigned'}
              </span>
              {locationPaths.length > 1 ? (
                <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>+{locationPaths.length - 1}</span>
              ) : null}
            </>
          }
        >
          {locationPaths.slice(1).map((path) => (
            <span key={path} className={cn(RECORD_ID_CLASS, 'block break-words text-mode-ink')}>{path}</span>
          ))}
          {Number.isFinite(allocated) && allocated > 0 ? (
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              {allocated} unit{allocated === 1 ? '' : 's'} allocated
            </span>
          ) : null}
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            SKU home bin{' '}
            <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal', homeBin ? 'text-mode-ink' : 'text-mode-warn')}>
              {homeBin ?? 'none'}
            </span>
          </span>
          <span className="block h-8">
            <LedgerSkuBinPicker sku={sku} current={homeBin} onCommit={(barcode) => commits.handleCommitSkuBin(line, barcode)} />
          </span>
        </EvidenceFactDisclosure>
        {chain ? (
          <>
            <EvidenceFactRow label="Picked by">
              <LedgerStageAssign
                verb="Pick"
                doneVerb="Picked"
                role="technician"
                facts={pickFacts}
                selectedStaffId={staff.testerId}
                assignedName={staff.testerDisplay}
                onCommit={assign ? (id, name) => commits.handleCommitStageAssign(line, 'orders.picked', id, name) : undefined}
                showStamp
              />
            </EvidenceFactRow>
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
            <EvidenceFactRow label="QC by">
              <span data-testid="order-record-qc">
                <LedgerStageAssign
                  verb="QC"
                  doneVerb="QC'd"
                  role="technician"
                  facts={qcWho || qcAt ? { who: qcWho, whoStaffId: qcId, at: qcAt, station: null } : null}
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
            {assign ? <OrderAutoAssignRuleLine record={line} records={records} getStaffName={getStaffName} /> : null}
          </>
        ) : null}
      </div>
    </article>
  );
}
