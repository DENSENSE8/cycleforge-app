'use client';

/**
 * To ship — the evidence column beside the industrial ledger.
 *
 * The desktop terminal's `.evidence-panel` on the web
 * (`v1-outbound/apps/desktop-tauri` `main.jsx`): one flush column, always
 * mounted, that answers "what is this order and where is it" for the record
 * the operator opened — SELECTED ORDER · the order number · its state · the
 * facts as a definition list · the verbs at the foot. Nothing opened, it reads
 * the queue instead (state totals, late, unlocated) so the column is never a
 * blank panel.
 *
 * It replaced the right-rail order inspector on this page (owner 2026-09-24:
 * the rail components were not built for this job). Facts come from the row the
 * queue already holds, and every edit is the ledger's own editor on the same
 * commit waist, so the column and the row cannot disagree. Two fetches on
 * open: the Label block — every label on the order with its purpose, from the
 * label ledger (`GET /api/orders/[id]/label-purchase`), and the stored
 * documents it prints from — and the Price panel
 * (`GET /api/orders/[id]/price-breakdown`, persisted ShipStation amounts). The
 * Customer block is the customer-book row `/api/orders` already joined onto
 * the order.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getTrackingUrl, getTrackingUrlByCarrier } from '@/lib/tracking-format';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { OrderNumberIdentity, TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import { ChevronLeft, ChevronRight, Printer, X } from '@/components/Icons';
import {
  daysLateOn,
  queueRowStaff,
  type OrdersQueueCommits,
} from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { useOrderChannel } from '@/hooks/useCatalog';
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { formatCurrency } from '@/utils/_number';
import {
  customerAddressLines,
  customerBillToLines,
  customerFullName,
  customerPhone,
  type CustomerBillTo,
  type CustomerRecord,
} from '@/lib/customers/customer-display';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import {
  EvidenceDisclosure,
  EvidenceFactDisclosure,
  EvidenceFactRow,
} from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { OrderLabelEntries } from './OrderLabelEntries';
import { OrderPriceEvidence } from './OrderPriceEvidence';
import { OrderAutoAssignRule } from './OrderAutoAssignRule';
import { ReturnReplacementLabelSection } from './ReturnReplacementLabelSection';
import type { OrderLabelStatus } from '@/lib/shipping/order-label-summary';
import {
  LIFECYCLE,
  STATE_TONE_CLASSES,
  type LifecycleState,
} from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_PRICE_CLASS,
  recordStateCodeClass,
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
import {
  LEDGER_HIT_CLASS,
} from './outbound-orders-ledger-geometry';
import {
  pickOrderDocument,
  printDocument,
  useOrderDocuments,
  useOrderLabelSummary,
} from '@/lib/orders/order-paperwork-client';
import { ItemPaperworkDialog } from './paperwork/PaperworkDocuments';
import {
  getRailActions,
  getServerRailActions,
  subscribeRailActions,
} from '@/lib/right-rail/rail-actions-store';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { resolveSelectionAction, type SelectionAction } from '@/lib/selection/selection-actions';

/** Queue-summary order when nothing is open: the states that need hands first. */
const SUMMARY_STATES: readonly LifecycleState[] = ['outOfStock', 'urgent', 'ready', 'packed'];

const ICON_BUTTON = cn(
  'ds-raw-button inline-flex w-8 items-center justify-center text-mode-ink hover:bg-mode-hover disabled:opacity-40',
  LEDGER_HIT_CLASS,
  focusRing('control'),
);

const VERB_BUTTON = cn(
  'ds-raw-button flex flex-1 items-center justify-center gap-2 border border-mode-ink px-3',
  LEDGER_HIT_CLASS,
  RECORD_LABEL_CLASS,
  focusRing('control'),
);

export interface OutboundOrderEvidenceProps {
  /** The open record (live row), or null. */
  record: ShippedOrder | null;
  /** The painted queue — the summary face when nothing is open. */
  records: readonly ShippedOrder[];
  todayKey: string;
  getStaffName: (id: number) => string;
  /** The open record is in the bulk check-set. */
  checked: boolean;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  onClose: () => void;
  onOpenLabels?: (record: ShippedOrder) => void;
  commits: OrdersQueueCommits;
}

export function OutboundOrderEvidence(props: OutboundOrderEvidenceProps) {
  const { record, onClose } = props;
  const cursor = useRecordCursor('record');

  // Escape closes the open record — the keyboard half of one-click-out. A menu
  // or dialog that owns Escape marks it handled first.
  useEffect(() => {
    if (!record) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (isEditableKeyTarget(event.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [record, onClose]);

  return (
    <div className="flex min-h-full flex-col">
      {/* Same 32px + 1px rule as the ledger toolbar, so the two bars read as one line. */}
      <div className={cn('box-content flex shrink-0 items-center border-b border-mode-ink pl-4', LEDGER_HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>Selected order</span>
        {record && cursor.available && cursor.position != null ? (
          <span className={cn(RECORD_LABEL_CLASS, 'px-2 tabular-nums text-mode-muted')}>
            {cursor.position} / {cursor.total}
          </span>
        ) : null}
        {record && cursor.available ? (
          <>
            <button
              type="button"
              aria-label="Previous order"
              className={ICON_BUTTON}
              disabled={cursor.prevDisabled || !cursor.onPrev}
              onClick={() => cursor.onPrev?.()}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next order"
              className={ICON_BUTTON}
              disabled={cursor.nextDisabled || !cursor.onNext}
              onClick={() => cursor.onNext?.()}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : null}
        {record ? (
          <button
            type="button"
            aria-label="Close order"
            data-testid="ledger-evidence-close"
            className={cn(ICON_BUTTON, 'border-l border-mode-edge')}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {record ? <OrderEvidence {...props} record={record} /> : <QueueEvidence {...props} />}
    </div>
  );
}

function OrderEvidence({
  record,
  records,
  todayKey,
  getStaffName,
  checked,
  onToggleSelect,
  onOpenLabels,
  commits,
}: OutboundOrderEvidenceProps & { record: ShippedOrder }) {
  const r = record as QueueRowRecord;
  const state = recordState(record);
  const spec = LIFECYCLE[state];
  const staff = queueRowStaff(r, getStaffName);
  const view = ordersCompoundView(record, {
    stateLabel: null,
    delayDays: daysLateOn(
      todayKey,
      (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
    ),
    todayKey,
  });
  const orderId = view.orderId ?? '';
  const channel = useOrderChannel()(orderId, view.platformValue);
  const meta = channel.meta;
  const locationPaths = formatOutboundStoragePath(record.storage_locations)?.split(' | ') ?? [];
  const buyer = orderBuyer(record);
  const homeBin = formatOutboundStoragePath(record.sku_home_location ? [record.sku_home_location] : null);
  const sku = view.detail?.sku ?? (String(record.sku ?? '').trim() || null);
  const allocated = Number(r.allocated_unit_count);
  const qty = Number(record.quantity);
  const amount = Number(record.sale_amount);
  const pickFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.picked', staff));
  const packFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.packed', staff));
  const bench = String(r.pack_location_name ?? '').trim() || null;
  const next = view.nextStep ?? null;
  const [itemPaperworkOpen, setItemPaperworkOpen] = useState(false);
  const labelIntakeEntry = useSearchParams().get('entry') === 'label';

  return (
    <>
      {/* Identity: the order number, its state, where it goes next. */}
      <div className="border-b-2 border-mode-ink px-4 pb-3 pt-3">
        <h2 className="select-all break-all font-mono text-role-display font-black tracking-tight">
          {orderId || `#${record.id}`}
        </h2>
      </div>
      <div
        className={cn(
          'flex items-center gap-2 border-b border-mode-ink px-4',
          LEDGER_HIT_CLASS,
        )}
      >
        <LifecycleCode state={state} srLabel={null}>
          {spec.code} · {spec.label}
        </LifecycleCode>
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
      <BuyerNoteBlock note={String(record.buyer_note ?? '').trim() || null} />

      {/* The thing itself: photo + title + SKU. */}
      <div className="flex gap-3 border-b border-mode-ink bg-mode-panel p-3">
        <span className="relative h-28 w-28 shrink-0 overflow-hidden border border-mode-rule bg-mode-well">
          {view.thumbUrl ? (
            <Image src={view.thumbUrl} alt="" fill unoptimized sizes="112px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-role-title font-black text-mode-muted" aria-hidden>
              {initials(view.title)}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          {view.titleHref ? (
            <a
              href={view.titleHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open listing in a new tab"
              className={cn(
                'line-clamp-3 text-role-body font-bold underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink',
                focusRing('control'),
              )}
            >
              {view.title || '—'}
            </a>
          ) : (
            <p className="line-clamp-3 text-role-body font-bold">{view.title || '—'}</p>
          )}
          <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{view.detail?.sku ?? '—'}</span>
          </p>
          {record.item_number ? (
            <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              ITEM{' '}
              <button
                type="button"
                data-testid="evidence-item-paperwork"
                title="Paperwork paired to this item number"
                onClick={() => setItemPaperworkOpen(true)}
                className={cn(
                  'ds-raw-button',
                  RECORD_ID_CLASS,
                  'normal-case tracking-normal text-mode-ink underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink',
                  focusRing('control'),
                )}
              >
                {record.item_number}
              </button>
            </p>
          ) : null}
          {/* Price one line under the item # (owner 2026-09-25) — its only place
              in the column, so the money reads with the thing it is for. */}
          <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')} data-testid="evidence-price">
            PRICE{' '}
            <span className={cn(RECORD_PRICE_CLASS, 'normal-case tracking-normal')}>
              {record.sale_amount != null && Number.isFinite(amount) ? formatCurrency(amount) : '—'}
            </span>
          </p>
          {record.item_number ? (
            <ItemPaperworkDialog
              open={itemPaperworkOpen}
              onOpenChange={setItemPaperworkOpen}
              orderId={record.id}
              orderRef={orderId || `order-${record.id}`}
              itemNumber={record.item_number}
            />
          ) : null}
        </div>
      </div>
      {/* Stock of this SKU (every bin, on hand) and the product catalog —
          flush bar segments, new tab so the desk keeps its place. */}
      <div className="flex items-stretch border-b border-mode-ink bg-mode-bar" data-testid="evidence-stock-links">
        <a
          href={sku ? `/inventory?sku=${encodeURIComponent(sku)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!sku}
          data-testid="evidence-sku-stock"
          className={cn(
            DESK_BAR_SEGMENT_CLASS,
            'flex-1 justify-center border-r border-mode-edge',
            deskBarSegmentTone(false),
            !sku && 'pointer-events-none opacity-40',
          )}
        >
          SKU stock ↗
        </a>
        <a
          href="/inventory/skus"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="evidence-all-products"
          className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center', deskBarSegmentTone(false))}
        >
          All products ↗
        </a>
      </div>
      <LabelEvidence orderId={record.id} orderRef={orderId || `#${record.id}`} />
      <ReturnReplacementLabelSection
        key={record.id}
        orderId={record.id}
        orderRef={orderId || `#${record.id}`}
        defaultOpen={labelIntakeEntry}
      />
      <OrderPriceEvidence orderId={record.id} />
      {buyer ? <CustomerEvidence customer={buyer.customer} source={buyer.source} /> : null}

      <div className="flex flex-col px-4">
        <EvidenceFactDisclosure
          label="Location"
          testId="evidence-location"
          value={
            <>
              <span className={cn(RECORD_ID_CLASS, 'min-w-0 truncate', locationPaths[0] ? 'text-mode-ink' : 'text-mode-warn')}>
                {locationPaths[0] ?? 'UNASSIGNED'}
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
            <LedgerSkuBinPicker
              sku={sku}
              current={homeBin}
              onCommit={(barcode) => commits.handleCommitSkuBin(record, barcode)}
            />
          </span>
        </EvidenceFactDisclosure>
        <EvidenceFactRow label="Platform">
          <span className="flex h-8 min-w-0 items-center gap-1.5" data-testid="evidence-platform">
            <BrandIdentityDot {...platformMetaBrandDot(meta)} />
            <span className="min-w-0 flex-1">
              <LedgerPlatformPicker
                value={view.platformValue ?? null}
                onCommit={(accountSource) => commits.handleCommitPlatform(record, accountSource)}
              />
            </span>
          </span>
        </EvidenceFactRow>
        {/* Identifiers wear the one record face (OrderIdentityChips): brand
            dot + last-8 copy chip, left-aligned, the actions to the right. */}
        <EvidenceFactRow label="Order #">
          <span className="flex min-w-0 flex-1 items-center" data-testid="evidence-order-chip">
            <span className="flex min-w-0 flex-1 items-center">
              <OrderNumberIdentity
                orderId={orderId || String(record.id)}
                platformLabel={channel.label || null}
                openHref={marketplaceOrderUrl(orderId, view.platformValue)}
              />
            </span>
            <LedgerOpenAction href={marketplaceOrderUrl(orderId, view.platformValue)} label="order number" />
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="Listing">
          <span className="block h-8">
            <LedgerListingLink href={view.titleHref ?? null} itemNumber={record.item_number ?? null} face="value" />
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="TRK#">
          <span className="flex min-w-0 flex-1 items-center" data-testid="evidence-tracking-chip">
            <span className="flex min-w-0 flex-1 items-center">
              {view.tracking ? (
                <TrackingIdentity tracking={view.tracking} carrierHint={view.carrier ?? null} />
              ) : (
                <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>NOT ATTACHED</span>
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
          <span className="block h-8">
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
        <EvidenceFactRow label="Condition">
          <LedgerCondition
            value={record.condition ?? null}
            onCommit={(value) => commits.handleCommitCondition(record, value)}
          />
        </EvidenceFactRow>
        <EvidenceFactRow label="Quantity">
          <span className="block h-8 w-28">
            <LedgerQty
              bare
              value={Number.isFinite(qty) && qty > 0 ? qty : 1}
              onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.qty', value)}
            />
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="Pick">
          <LedgerStageAssign
            verb="Pick"
            doneVerb="Picked"
            role="technician"
            facts={pickFacts}
            selectedStaffId={staff.testerId}
            assignedName={staff.testerDisplay}
            onCommit={(id, name) => commits.handleCommitStageAssign(record, 'orders.picked', id, name)}
            showStamp
          />
        </EvidenceFactRow>
        <EvidenceFactRow label="Pack">
          <LedgerStageAssign
            verb="Pack"
            doneVerb="Packed"
            role="packer"
            facts={packFacts}
            selectedStaffId={staff.packerId}
            assignedName={staff.packerDisplay}
            onCommit={(id, name) => commits.handleCommitStageAssign(record, 'orders.packed', id, name)}
            showStamp
          />
        </EvidenceFactRow>
        {/* The listing rule for this item # (+ SKU): picker / packer and their
            backups. Keyed by record so an unsaved draft never follows J / K. */}
        <OrderAutoAssignRule key={record.id} record={record} records={records} getStaffName={getStaffName} />
        {bench ? (
          <EvidenceFactRow label="Pack bench">
            <span className={RECORD_LABEL_CLASS}>{bench}</span>
          </EvidenceFactRow>
        ) : null}
        {/* The latest face of the `order_notes` trail, edited in place and
            autosaved (the same field the row's NOTE badge opens). Keyed by
            record so switching orders saves the old draft, then reseeds. */}
        <div className="border-b border-mode-edge py-2">
          <LedgerNoteField key={record.id} label="Note" orderId={Number(record.id)} note={record.notes ?? null} />
        </div>
      </div>

      <div className="mt-auto">
      <RecordVerbs record={record} />

      {/* Labels walk · add this order to the bulk check-set. */}
      <div className="flex gap-2 border-t border-mode-ink p-4">
        {onOpenLabels ? (
          <button
            type="button"
            data-testid="ledger-evidence-labels"
            className={cn(VERB_BUTTON, 'bg-mode-panel text-mode-ink hover:bg-mode-hover')}
            onClick={() => onOpenLabels(record)}
          >
            Labels
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={checked}
          data-testid="ledger-evidence-actions"
          className={cn(VERB_BUTTON, 'bg-mode-ink text-mode-bar')}
          title="Add this order to the bulk selection (the bar under the table acts on many orders)"
          onClick={(event) => onToggleSelect(record, { shiftKey: event.shiftKey })}
        >
          {checked ? 'Selected' : 'Select'}
        </button>
      </div>
      </div>
    </>
  );
}

/** Nothing open: the queue read as the floor reads it — what needs hands. */
function QueueEvidence({ records, todayKey }: OutboundOrderEvidenceProps) {
  const summary = useMemo(() => {
    const byState: Record<LifecycleState, number> = { ready: 0, urgent: 0, packed: 0, outOfStock: 0, shipped: 0, onHold: 0 };
    let late = 0;
    let unlocated = 0;
    for (const record of records) {
      byState[recordState(record)] += 1;
      const r = record as QueueRowRecord;
      const days = daysLateOn(
        todayKey,
        (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
      );
      if (days != null && days > 0) late += 1;
      if (!formatOutboundStoragePath(record.storage_locations)) unlocated += 1;
    }
    return { byState, late, unlocated };
  }, [records, todayKey]);

  return (
    <>
      <div className="border-b-2 border-mode-ink px-4 pb-3 pt-3">
        <p className="font-mono text-role-display font-black tracking-tight text-mode-muted">—</p>
      </div>
      <div className={cn('flex items-center border-b border-mode-ink px-4', LEDGER_HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>No order selected</span>
      </div>
      <div className="flex flex-col px-4">
        {SUMMARY_STATES.map((state) => (
          <EvidenceFactRow key={state} label={LIFECYCLE[state].code}>
            <span className="flex items-center justify-between">
              <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(LIFECYCLE[state]))}>{LIFECYCLE[state].label}</span>
              <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.byState[state]}</span>
            </span>
          </EvidenceFactRow>
        ))}
        <EvidenceFactRow label="Late">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, STATE_TONE_CLASSES.danger.text)}>Past ship-by</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.late}</span>
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="No bin">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>Unassigned location</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.unlocated}</span>
          </span>
        </EvidenceFactRow>
      </div>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-edge p-4 text-mode-muted')}>
        Open a record · J / K to step · Esc to close
      </p>
    </>
  );
}

/** How each label status reads in the column (mono-caps code, its tone, why). */
const LABEL_STATUS_FACE: Readonly<Record<OrderLabelStatus, { label: string; tone: string; tip: string }>> = {
  none: { label: 'None', tone: 'text-mode-warn', tip: 'No shipping label on this order yet.' },
  bought: { label: 'Bought', tone: STATE_TONE_CLASSES.success.text, tip: 'Label bought through ShipStation.' },
  pending: {
    label: 'Unresolved',
    tone: STATE_TONE_CLASSES.danger.text,
    tip: 'A purchase started and never finished — check ShipStation before buying again.',
  },
  linked: { label: 'Linked', tone: 'text-mode-ink', tip: 'A label is attached to this order; it was not bought here.' },
  voided: { label: 'Voided', tone: 'text-mode-muted', tip: 'The last label was voided and nothing has replaced it.' },
};

/**
 * The order's labels: the outbound status (what To-ship needs), then EVERY
 * label on the order — outbound, return, replacement; bought here, imported
 * from ShipStation, or paired with Link label — each with its purpose, cost,
 * tracking, ticket links and Print · Ticket · Unlink (`OrderLabelEntries`).
 * The bar under them prints the order's stored label and slip — the same
 * documents and `printDocument` call the Labels walk's success card prints.
 */
function LabelEvidence({ orderId, orderRef }: { orderId: number; orderRef: string }) {
  const summaryQuery = useOrderLabelSummary(orderId);
  const documentsQuery = useOrderDocuments(orderId);
  const summary = summaryQuery.data ?? null;
  const purchase = summary?.purchase ?? null;
  const labels = summary?.labels ?? [];
  const face = summary ? LABEL_STATUS_FACE[summary.status] : null;
  const documents = documentsQuery.data?.documents ?? [];
  const labelSrc = outboundDocumentContentSrc(
    pickOrderDocument(documents, 'shipping_label', purchase?.labelDocumentId ?? null),
  );
  const slipSrc = outboundDocumentContentSrc(pickOrderDocument(documents, 'packing_slip', null));

  return (
    <EvidenceDisclosure
      label={labels.length > 1 ? `Labels · ${labels.length}` : 'Labels'}
      testId="evidence-label"
      summary={
        <span
          data-testid="evidence-label-status"
          title={summaryQuery.isError ? summaryQuery.error.message : face?.tip}
          className={cn(RECORD_LABEL_CLASS, summaryQuery.isError ? 'text-mode-warn' : (face?.tone ?? 'text-mode-muted'))}
        >
          {summaryQuery.isError ? 'Unreadable' : (face?.label ?? '…')}
        </span>
      }
    >
      {summary?.status === 'pending' ? (
        <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-edge px-4 py-2', STATE_TONE_CLASSES.danger.text)}>
          {LABEL_STATUS_FACE.pending.tip}
        </p>
      ) : null}
      <OrderLabelEntries orderId={orderId} orderRef={orderRef} labels={labels} documents={documents} />
      <div className="flex items-stretch border-t border-mode-edge bg-mode-bar" data-testid="evidence-label-print">
        <button
          type="button"
          disabled={!labelSrc}
          title={labelSrc ? 'Print the stored shipping label' : 'No shipping label stored on this order'}
          data-testid="evidence-print-label"
          className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center border-r border-mode-edge', deskBarSegmentTone(false))}
          onClick={() => labelSrc && printDocument(labelSrc)}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print label
        </button>
        <button
          type="button"
          disabled={!slipSrc}
          title={slipSrc ? 'Print the stored packing slip' : 'No packing slip stored on this order'}
          data-testid="evidence-print-slip"
          className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center', deskBarSegmentTone(false))}
          onClick={() => slipSrc && printDocument(slipSrc)}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print slip
        </button>
      </div>
    </EvidenceDisclosure>
  );
}

/**
 * A ShipStation ship-to (`shipstation_order_refs.ship_to`) as the book's DTO,
 * so an order with no customer-book buyer reads through the same readers.
 */
function shipToCustomer(shipTo: CustomerBillTo): CustomerRecord {
  return {
    id: 0,
    display_name: shipTo.name ?? null,
    customer_name: shipTo.company ?? null,
    first_name: null,
    last_name: null,
    email: null,
    phone: shipTo.phone ?? null,
    mobile: null,
    shipping_address_1: shipTo.address1 ?? null,
    shipping_address_2: shipTo.address2 ?? null,
    shipping_city: shipTo.city ?? null,
    shipping_state: shipTo.state ?? null,
    shipping_postal_code: shipTo.postalCode ?? null,
    shipping_country: shipTo.country ?? null,
    billing_address: null,
  };
}

/**
 * The order's buyer: the customer-book row (`orders.customer_id → customers`,
 * joined by `/api/orders`), else its ShipStation order's ship-to. Null when
 * the order carries neither.
 */
function orderBuyer(record: ShippedOrder): { customer: CustomerRecord; source?: string } | null {
  if (record.customer) return { customer: record.customer };
  if (record.customer_id == null && record.shipstation_ship_to) {
    return { customer: shipToCustomer(record.shipstation_ship_to), source: 'ShipStation' };
  }
  return null;
}

/**
 * The buyer as one collapsible section: name (or the source) in the header,
 * then email, phone, the full ship-to, and the bill-to only when it is a
 * different address. Same readers as `CustomerDetailsTab`, in the column's
 * industrial face.
 */
function CustomerEvidence({ customer, source }: { customer: CustomerRecord; source?: string }) {
  const [copied, setCopied] = useState(false);
  const name = customerFullName(customer);
  const email = String(customer.email ?? '').trim();
  const phone = customerPhone(customer);
  const shipTo = customerAddressLines(customer);
  const billTo = customerBillToLines(customer);
  if (!name && !email && !phone && shipTo.length === 0) return null;

  const copyAddress = () => {
    void navigator.clipboard.writeText([name, ...shipTo].filter(Boolean).join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <EvidenceDisclosure
      label="Customer"
      testId="evidence-customer"
      summary={
        <span className={cn(RECORD_ID_CLASS, 'truncate text-mode-ink')} title={name || undefined}>
          {name || source || 'details'}
        </span>
      }
    >
      <div className="flex flex-col px-4">
        {source ? (
          <EvidenceFactRow label="Source">
            <span className={RECORD_LABEL_CLASS}>{source}</span>
          </EvidenceFactRow>
        ) : null}
        {name ? (
          <EvidenceFactRow label="Name">
            <span className="block truncate font-bold" title={name}>{name}</span>
          </EvidenceFactRow>
        ) : null}
        {email ? (
          <EvidenceFactRow label="Email">
            <a
              href={`mailto:${email}`}
              title={email}
              className={cn('block truncate underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink', focusRing('control'))}
            >
              {email}
            </a>
          </EvidenceFactRow>
        ) : null}
        {phone ? (
          <EvidenceFactRow label="Phone">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{phone}</span>
          </EvidenceFactRow>
        ) : null}
        {shipTo.length > 0 ? (
          <EvidenceFactRow label="Ship to" wide>
            <span className="block select-all whitespace-pre-line break-words">{shipTo.join('\n')}</span>
          </EvidenceFactRow>
        ) : null}
        {billTo.length > 0 ? (
          <EvidenceFactRow label="Bill to" wide>
            <span className="block select-all whitespace-pre-line break-words">{billTo.join('\n')}</span>
          </EvidenceFactRow>
        ) : null}
      </div>
      {shipTo.length > 0 ? (
        <div className="flex items-stretch bg-mode-bar">
          <button
            type="button"
            data-testid="evidence-customer-copy-address"
            title="Copy the name and ship-to address"
            className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center', deskBarSegmentTone(false))}
            onClick={copyAddress}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
        </div>
      ) : null}
    </EvidenceDisclosure>
  );
}

/**
 * The order's actions, in the column where the operator is already looking —
 * the SAME verb catalog the bulk bar runs (`useDashboardBulkSelection`, read
 * from the rail-actions store), resolved for this ONE order: the catalog at
 * n=1, never a second implementation (table-engine law: "the row menu is the
 * same catalog at n=1"). Direction comes from the row (Mark urgent / Clear
 * urgent); a verb that cannot run says why in its tooltip; Delete sits apart.
 */
function RecordVerbs({ record }: { record: ShippedOrder }) {
  const snapshot = useSyncExternalStore(subscribeRailActions, getRailActions, getServerRailActions);
  const resolved = useMemo(() => {
    if (snapshot.scope !== DASHBOARD_ORDERS_SELECTION_SCOPE) return [];
    const actions = snapshot.actions as SelectionAction<ShippedOrder>[];
    return actions.map((action) => resolveSelectionAction(action, [record]));
  }, [snapshot, record]);

  if (resolved.length === 0) return null;
  const main = resolved.filter((r) => r.action.key !== 'delete');
  const destructive = resolved.filter((r) => r.action.key === 'delete');
  const groups = new Map<string, typeof main>();
  for (const r of main) {
    const group = r.action.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), r]);
  }

  const button = (r: (typeof resolved)[number], danger = false) => (
    <button
      key={r.action.key}
      type="button"
      disabled={r.disabled}
      title={r.reason}
      data-testid={`ledger-evidence-verb-${r.action.key}`}
      className={cn(
        VERB_BUTTON,
        'flex-none justify-start border-mode-edge bg-mode-panel text-mode-ink enabled:hover:bg-mode-hover disabled:opacity-40',
        danger && 'border-border-danger text-text-danger enabled:hover:bg-surface-danger',
      )}
      onClick={() => {
        void r.action.run([record], r.direction ? { direction: r.direction } : undefined);
      }}
    >
      {r.action.icon}
      {r.label}
    </button>
  );

  return (
    <section aria-label="Order actions" data-testid="ledger-evidence-verbs" className="border-t border-mode-ink px-4 py-3">
      {[...groups.entries()].map(([group, items]) => (
        <div key={group || 'lead'} className="mb-3 last:mb-0">
          {group ? <p className={cn(RECORD_LABEL_CLASS, 'mb-1.5 text-mode-muted')}>{group}</p> : null}
          <div className="grid grid-cols-2 gap-1.5">{items.map((r) => button(r))}</div>
        </div>
      ))}
      {destructive.length > 0 ? (
        <div className="mt-3 border-t border-mode-edge pt-3">{destructive.map((r) => button(r, true))}</div>
      ) : null}
    </section>
  );
}
