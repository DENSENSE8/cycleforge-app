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
 * queue already holds — no fetch on open — and every edit is the ledger's own
 * editor on the same commit waist, so the column and the row cannot disagree.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import Image from 'next/image';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getTrackingUrl, getTrackingUrlByCarrier } from '@/lib/tracking-format';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { OrderNumberIdentity, TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
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
  LIFECYCLE,
  LIFECYCLE_CLASSES,
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
} from '@/design-system/tokens/industrial-record';
import { initials, recordState } from './outbound-orders-ledger-state';
import {
  LedgerCondition,
  LedgerListingLink,
  LedgerNote,
  LedgerPlatformPicker,
  LedgerSkuBinPicker,
  LedgerTrackingReplace,
  LedgerOpenAction,
  LedgerQty,
  LedgerShipBy,
  LedgerStageAssign,
  stageFacts,
} from './outbound-orders-ledger-editors';
import {
  LEDGER_HIT_CLASS,
} from './outbound-orders-ledger-geometry';

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

/** One fact row: mono label over (or beside) its value, ruled underneath. */
function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 border-b border-mode-edge', wide ? 'flex-col py-2' : 'items-center')}>
      <dt className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted', !wide && 'py-2')}>{label}</dt>
      <dd className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</dd>
    </div>
  );
}

function OrderEvidence({
  record,
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
  const locations = formatOutboundStoragePath(record.storage_locations);
  const homeBin = formatOutboundStoragePath(record.sku_home_location ? [record.sku_home_location] : null);
  const sku = view.detail?.sku ?? (String(record.sku ?? '').trim() || null);
  const allocated = Number(r.allocated_unit_count);
  const qty = Number(record.quantity);
  const amount = Number(record.sale_amount);
  const pickFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.picked', staff));
  const packFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.packed', staff));
  const bench = String(r.pack_location_name ?? '').trim() || null;
  const next = view.nextStep ?? null;

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
          state === 'outOfStock' && LIFECYCLE_CLASSES.outOfStock.tint,
        )}
      >
        <span className={cn('h-2 w-2 shrink-0', LIFECYCLE_CLASSES[state].dot)} aria-hidden />
        <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(state))}>
          {spec.code} · {spec.label}
        </span>
        <span
          className={cn(
            RECORD_LABEL_CLASS,
            'ml-auto',
            next?.blocked ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink',
          )}
          title={next?.tip}
        >
          {next?.label ?? ''}
        </span>
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
              ITEM <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{record.item_number}</span>
            </p>
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

      <dl className="flex flex-col px-4">
        <Fact label="Location" wide>
          <span className={cn(RECORD_ID_CLASS, 'block break-words', locations ? 'text-mode-ink' : 'text-mode-warn')}>
            {locations ? locations.split(' | ').map((path) => <span key={path} className="block">{path}</span>) : 'UNASSIGNED'}
          </span>
          {Number.isFinite(allocated) && allocated > 0 ? (
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
              {allocated} unit{allocated === 1 ? '' : 's'} allocated
            </span>
          ) : null}
          {/* The SKU's home bin — where it is picked from until a unit is
              allocated. Editable here (owner 2026-09-24); scan pairing stays
              the phone verb. */}
          <span className={cn(RECORD_LABEL_CLASS, 'mt-1 block text-mode-muted')}>
            SKU home bin{' '}
            <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal', homeBin ? 'text-mode-ink' : 'text-mode-warn')}>
              {homeBin ?? 'none'}
            </span>
          </span>
          <span className="mt-1 block h-8 border border-mode-edge bg-mode-panel">
            <LedgerSkuBinPicker
              sku={sku}
              current={homeBin}
              onCommit={(barcode) => commits.handleCommitSkuBin(record, barcode)}
            />
          </span>
        </Fact>
        <Fact label="Platform" wide>
          <span className="inline-flex items-center gap-1.5">
            <BrandIdentityDot {...platformMetaBrandDot(meta)} />
            <span className={RECORD_LABEL_CLASS}>{channel.label || '—'}</span>
            {channel.connectionName ? (
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>· {channel.connectionName}</span>
            ) : null}
          </span>
          {/* Imported under the wrong channel? Re-point it (orders.account_source). */}
          <span className="mt-1 block h-8 border border-mode-edge bg-mode-panel">
            <LedgerPlatformPicker
              value={view.platformValue ?? null}
              onCommit={(accountSource) => commits.handleCommitPlatform(record, accountSource)}
            />
          </span>
        </Fact>
        {/* Identifiers wear the one record face (OrderIdentityChips): brand
            dot + last-8 copy chip, left-aligned, the actions to the right. */}
        <Fact label="Order #">
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
        </Fact>
        <Fact label="Listing">
          <span className="block h-8">
            <LedgerListingLink href={view.titleHref ?? null} itemNumber={record.item_number ?? null} face="value" />
          </span>
        </Fact>
        <Fact label="TRK#">
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
        </Fact>
        <Fact label="Ship by">
          <span className="block h-8">
            <LedgerShipBy
              dateKey={view.delay?.dateKey ?? null}
              overdueDays={view.delay?.overdue ? view.delay.days : 0}
              dueToday={Boolean(view.delay?.dueToday)}
              tip={view.delayTip}
              onCommit={(key) => commits.handleCommitShipBy(record, key)}
            />
          </span>
        </Fact>
        <Fact label="Ordered">
          <span className={RECORD_ID_CLASS}>{view.orderedAt?.label || '—'}</span>
        </Fact>
        <Fact label="Condition">
          <LedgerCondition
            value={record.condition ?? null}
            onCommit={(value) => commits.handleCommitCondition(record, value)}
          />
        </Fact>
        <Fact label="Quantity">
          <span className="block h-8 w-28">
            <LedgerQty
              bare
              value={Number.isFinite(qty) && qty > 0 ? qty : 1}
              onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.qty', value)}
            />
          </span>
        </Fact>
        <Fact label="Price">
          <span className={RECORD_PRICE_CLASS}>
            {record.sale_amount != null && Number.isFinite(amount) ? formatCurrency(amount) : '—'}
          </span>
        </Fact>
        <Fact label="Pick">
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
        </Fact>
        <Fact label="Pack">
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
        </Fact>
        {bench ? (
          <Fact label="Pack bench">
            <span className={RECORD_LABEL_CLASS}>{bench}</span>
          </Fact>
        ) : null}
        <Fact label="Note" wide>
          {record.notes ? <p className="whitespace-pre-wrap break-words pb-1 text-role-caption text-mode-ink">{record.notes}</p> : null}
          <span className="block h-8 border border-mode-edge bg-mode-panel">
            <LedgerNote
              value=""
              onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.notes', value)}
            />
          </span>
        </Fact>
      </dl>

      {/* Verbs: the bulk bar owns the governed actions — this opens it on this order. */}
      <div className="mt-auto flex gap-2 border-t border-mode-ink p-4">
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
          onClick={() => onToggleSelect(record, { shiftKey: false })}
        >
          {checked ? 'Clear actions' : 'Actions'}
        </button>
      </div>
    </>
  );
}

/** Nothing open: the queue read as the floor reads it — what needs hands. */
function QueueEvidence({ records, todayKey }: OutboundOrderEvidenceProps) {
  const summary = useMemo(() => {
    const byState: Record<LifecycleState, number> = { ready: 0, urgent: 0, packed: 0, outOfStock: 0, shipped: 0 };
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
      <dl className="flex flex-col px-4">
        {SUMMARY_STATES.map((state) => (
          <Fact key={state} label={LIFECYCLE[state].code}>
            <span className="flex items-center justify-between">
              <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(state))}>{LIFECYCLE[state].label}</span>
              <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.byState[state]}</span>
            </span>
          </Fact>
        ))}
        <Fact label="Late">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, STATE_TONE_CLASSES.danger.text)}>Past ship-by</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.late}</span>
          </span>
        </Fact>
        <Fact label="No bin">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>Unassigned location</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.unlocated}</span>
          </span>
        </Fact>
      </dl>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-edge p-4 text-mode-muted')}>
        Open a record · J / K to step · Esc to close
      </p>
    </>
  );
}
