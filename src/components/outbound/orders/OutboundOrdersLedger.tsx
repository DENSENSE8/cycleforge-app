'use client';

/**
 * Outbound › To ship — the industrial record ledger (BRIEF §4 industrial,
 * `docs/design-system/HANDOFF-outbound-to-ship-ledger.md`).
 *
 * Deliberately NOT the slot `DataTable`. Every order is a flush, full-width
 * record separated by a 1px ink rule — no column header, no gutters, no card:
 *
 *   spine │ photo │ context   CODE · platform · order # · bin ····· ship-by / LATE
 *         │       │ identity  title ······················· condition · QTY n
 *         │       │ facts     ☐ · price · SKU · Pick · Pack · note ····· → next
 *
 * Presentation only. The feed (`useOrdersQueueFeed`) is the same one the slot
 * table reads: rows + grouping + URL sort, the selection / cursor / inspector
 * plane, the one assignment waist for every inline edit. Colour comes from the
 * industrial mode (`*-mode-*`) and from `LIFECYCLE`; geometry from
 * `outbound-orders-ledger-geometry.ts`. No motion anywhere on this surface.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { SearchField } from '@/design-system/primitives';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { ToolbarListboxOption } from '@/design-system/primitives/ToolbarListbox';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import {
  DataTableFilterMenu,
  DataTablePageSizeMenu,
  DataTableSortMenu,
  type DataTableFilterOption,
} from '@/components/tables/DataTable';
import { DataTableFullscreenToggle } from '@/components/tables/DataTableFullscreenToggle';
import { TableStatusBar } from '@/components/tables/TableStatusBar';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import {
  canAssignCompoundStage,
  formatCompoundStageStepLine,
  type CompoundSlotValue,
  type CompoundStageStepFacts,
} from '@/components/tables/compound/compound-row-model';
import { ChevronDown, ChevronRight, FileText } from '@/components/Icons';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { OrdersLedgerStandIn } from '@/components/dashboard/OrdersQueueFirstPaint';
import {
  SLOT_TABLE_ACTION_ROW_ATTR,
  SLOT_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/slot-table-overlay-host';
import { OrdersMorphingHost } from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';
import {
  useOrdersQueueFeed,
  daysLateOn,
  queueRowStaff,
  type OrdersQueueCommits,
} from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import { parentOrderLineTotals } from '@/components/dashboard/orders-queue/QueueGroupRow';
import {
  resolveRowWorkflowStage,
  type QueueRowRecord,
} from '@/components/dashboard/orders-queue/helpers';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import { emitSelectionTotal, emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  clearSlotTableVisibleIds,
  publishSlotTableVisibleIds,
} from '@/lib/tables/slot-table-visible';
import {
  SLOT_TABLE_PAGE_SIZE,
  SLOT_TABLE_PAGE_SIZES,
  isSlotTablePageSize,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  readSlotTablePageSize,
  writeSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import { flattenRenderOrder, type RowGroup } from '@/lib/group-rows';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { orderCarrierBoxes } from '@/lib/orders/order-group-identity';
import { orderLifecycleState } from '@/lib/order-lifecycle';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import {
  conditionGradeTableLabel,
  conditionOptions,
  resolveConditionGrade,
} from '@/lib/conditions';
import { dateKeyToLocalDate, formatDateKeyShort, localDateToDateKey } from '@/utils/date';
import { formatCurrency } from '@/utils/_number';
import {
  LIFECYCLE,
  LIFECYCLE_CLASSES,
  STATE_TONE_CLASSES,
  type LifecycleState,
} from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useLedgerRowZoom } from './useLedgerRowZoom';
import {
  LEDGER_BAND_CLASS,
  LEDGER_CHILD_INDENT_CLASS,
  LEDGER_DENSITY_STYLE,
  LEDGER_GROUP_CLASS,
  LEDGER_GROUP_PX,
  LEDGER_HIT_CLASS,
  LEDGER_ID_CLASS,
  LEDGER_LABEL_CLASS,
  LEDGER_PHOTO_CLASS,
  LEDGER_ROW_CLASS,
  LEDGER_ROW_PX,
  LEDGER_ROW_ZOOMS,
  LEDGER_SPINE_CLASS,
  LEDGER_SPINE_HATCH_CLASS,
  LEDGER_TITLE_CLASS,
  LEDGER_TOOLBAR_CLASS,
  LEDGER_NESTED_HIT_CLASS,
  LEDGER_ZOOM_LABEL,
  type LedgerRowZoom,
} from './outbound-orders-ledger-geometry';

/** Worst-first — a group's shared spine wears its worst child. */
const STATE_RANK: Readonly<Record<LifecycleState, number>> = {
  outOfStock: 0,
  urgent: 1,
  packed: 2,
  ready: 3,
  shipped: 4,
};

/** State code ink. Urgent reads in the mode's warn ink — amber fails 4.5:1 as text. */
function stateCodeClass(state: LifecycleState): string {
  return state === 'urgent' ? 'text-mode-warn' : LIFECYCLE_CLASSES[state].text;
}

const CONDITION_OPTIONS = conditionOptions('table').map((opt) => ({
  value: opt.value as string,
  label: opt.label,
  toneClass: conditionGradeTextClass(opt.value),
}));

const OVERSCAN = 8;

type LedgerItem =
  | { kind: 'group'; key: string; group: RowGroup<ShippedOrder>; state: LifecycleState; folded: boolean }
  | {
      kind: 'row';
      key: string;
      record: ShippedOrder;
      state: LifecycleState;
      /** Seed-group child: the group's state paints the shared spine. */
      groupState: LifecycleState | null;
    };

function recordState(record: ShippedOrder): LifecycleState {
  const r = record as QueueRowRecord;
  return orderLifecycleState(resolveRowWorkflowStage(r), { urgent: Boolean(r.is_urgent) });
}

function worstState(states: readonly LifecycleState[]): LifecycleState {
  return states.reduce<LifecycleState>(
    (worst, s) => (STATE_RANK[s] < STATE_RANK[worst] ? s : worst),
    'ready',
  );
}

function initials(title: string): string {
  return (
    title
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CF'
  );
}

/** Stops a control's click from reaching the row's open target. */
function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export interface OutboundOrdersLedgerProps {
  chrome: ToShipChrome;
  /** The queue fetch for the CURRENT find text is still running. */
  searchPending: boolean;
  records: ShippedOrder[];
  loading: boolean;
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord: () => void;
  railSelection: boolean;
  onLoadMore?: () => void;
  /** Non-blocking band above the rows (refresh failed while rows are painted). */
  banner?: ReactNode;
  searchEmptyTitle: string;
  searchResultLabel: string;
  clearSearchLabel: string;
}

export function OutboundOrdersLedger({
  chrome,
  searchPending,
  records,
  loading,
  onOpenRecord,
  onCloseRecord,
  railSelection,
  onLoadMore,
  banner,
  searchEmptyTitle,
  searchResultLabel,
  clearSearchLabel,
}: OutboundOrdersLedgerProps) {
  const searchValue = chrome.search.value;
  const feed = useOrdersQueueFeed({
    records,
    searchValue,
    // `/api/orders?q=` ran the match over the whole scope; `records` ARE the hits.
    searchAnsweredBy: 'server',
    onOpenRecord,
    onCloseRecord,
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    railSelection,
    queueMode: 'fulfillment',
    tableId: 'orders',
    surfaceId: 'pending-grid-body',
  });
  const { plane, orderGroupsByDate, displayedRecords, painted } = feed;
  const { zoom, setZoom } = useLedgerRowZoom('orders');

  // The plane publishes the record cursor; this surface turns the keyboard on.
  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  // ── Page (same page model + persisted size as the slot table) ─────────────
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<SlotTablePageSize>(SLOT_TABLE_PAGE_SIZE);
  useEffect(() => {
    setPageSize(readSlotTablePageSize());
  }, []);
  useEffect(() => {
    setPageIndex(0);
  }, [searchValue, pageSize]);
  const paged = useMemo(
    () => pageGroupedRenderOrder(orderGroupsByDate, pageIndex, pageSize),
    [orderGroupsByDate, pageIndex, pageSize],
  );
  useEffect(() => {
    if (pageIndex > paged.pageCount - 1) setPageIndex(Math.max(0, paged.pageCount - 1));
  }, [pageIndex, paged.pageCount]);

  const visibleIds = useMemo(
    () =>
      flattenRenderOrder(paged.order)
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    [paged.order],
  );
  useEffect(() => {
    publishSlotTableVisibleIds(DASHBOARD_ORDERS_SELECTION_SCOPE, visibleIds);
    emitSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE, visibleIds.length);
    return () => clearSlotTableVisibleIds(DASHBOARD_ORDERS_SELECTION_SCOPE);
  }, [visibleIds]);

  const scrollToKey = plane.selectedRecord
    ? String(plane.selectedRecord.id)
    : slotTableFindHighlightId({
        query: searchValue,
        paintedRowIds: painted.map((row) => String(row.id)),
      });
  const getRowKey = useCallback((r: ShippedOrder) => String(r.id), []);
  useEffect(() => {
    if (!scrollToKey) return;
    const next = pageIndexForRowId(orderGroupsByDate, pageSize, scrollToKey, getRowKey);
    if (next != null && next !== pageIndex) setPageIndex(next);
  }, [scrollToKey, getRowKey, orderGroupsByDate, pageIndex, pageSize]);

  // ── Items (fixed height per kind + zoom — the virtualizer never measures) ──
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFold = useCallback((key: string) => {
    setFoldedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const items = useMemo<LedgerItem[]>(() => {
    const out: LedgerItem[] = [];
    for (const [, groups] of paged.order) {
      for (const group of groups) {
        const states = group.rows.map(recordState);
        if (group.rows.length > 1) {
          const groupState = worstState(states);
          const folded = foldedGroups.has(group.key);
          out.push({ kind: 'group', key: `g:${group.key}`, group, state: groupState, folded });
          if (folded) continue;
          group.rows.forEach((record, i) =>
            out.push({ kind: 'row', key: `r:${record.id}`, record, state: states[i]!, groupState }),
          );
          continue;
        }
        const record = group.rows[0];
        if (record) out.push({ kind: 'row', key: `r:${record.id}`, record, state: states[0]!, groupState: null });
      }
    }
    return out;
  }, [paged.order, foldedGroups]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index]?.kind === 'group' ? LEDGER_GROUP_PX[zoom] : LEDGER_ROW_PX[zoom],
    getItemKey: (index) => items[index]?.key ?? index,
    overscan: OVERSCAN,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, zoom, items]);
  useEffect(() => {
    if (!scrollToKey) return;
    const idx = items.findIndex((it) => it.kind === 'row' && String(it.record.id) === scrollToKey);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' });
  }, [scrollToKey, items, virtualizer]);

  // ── Selection chrome ───────────────────────────────────────────────────────
  const selectedRows = useTableSelection<{ id?: number | string }>(
    DASHBOARD_ORDERS_SELECTION_SCOPE,
    (r) => Number(r.id),
  );
  const selectionTotal = useTableSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE);
  const selectedCount = selectedRows.length;
  const allSelected = selectionTotal > 0 && selectedCount >= selectionTotal;

  const filterActive = chrome.filter.options.some((o: DataTableFilterOption) => o.active);
  const isNarrowed = Boolean(searchValue.trim()) || filterActive;
  const openId = plane.selectedRecord ? Number(plane.selectedRecord.id) : null;

  const focusFirstRow = useCallback(() => {
    scrollRef.current?.querySelector<HTMLElement>('[data-ledger-open]')?.focus();
  }, []);

  // Stable across renders so a memoized record repaints only when ITS facts move.
  const {
    handleCommitCondition,
    handleCommitShipBy,
    handleCommitStageAssign,
    handleCommitSubtitleField,
  } = feed;
  const commits = useMemo<OrdersQueueCommits>(
    () => ({
      handleCommitCondition,
      handleCommitShipBy,
      handleCommitStageAssign,
      handleCommitSubtitleField,
    }),
    [handleCommitCondition, handleCommitShipBy, handleCommitStageAssign, handleCommitSubtitleField],
  );

  return (
    <div
      data-testid="pending-grid-body"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-mode-canvas text-mode-ink"
      style={LEDGER_DENSITY_STYLE}
    >
      {/* ── Toolbar: read · narrow · order · views · page — gap — draw ─────── */}
      <div
        data-testid="data-table-toolbar"
        className={cn(LEDGER_TOOLBAR_CLASS, LEDGER_NESTED_HIT_CLASS)}
      >
        <GridRowCheckbox
          checked={allSelected ? true : selectedCount > 0 ? 'mixed' : false}
          onToggle={() =>
            emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, allSelected ? 'none' : 'all')
          }
          label={allSelected ? 'Clear selection' : 'Select all orders on this page'}
          className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
        />
        <SearchField
          value={searchValue}
          onChange={chrome.search.onChange}
          placeholder={chrome.search.placeholder}
          isSearching={searchPending}
          onNavigateResults={focusFirstRow}
          inputRef={(el) => {
            if (el) el.setAttribute('aria-label', chrome.search.placeholder);
          }}
          className="min-w-0 max-w-[22rem] flex-1 overflow-hidden rounded-none"
          tone="neutral"
          hideUnderline
          fillHost
        />
        <DataTableFilterMenu {...chrome.filter} />
        <DataTableSortMenu {...feed.sortMenu} />
        {feed.views ? (
          <div data-testid="data-table-views" className="inline-flex shrink-0 items-center">
            <WorkbenchViewsMenu
              storageKey={feed.views.storageKey}
              paramKeys={feed.views.paramKeys}
              emptyHint={feed.views.emptyHint}
            />
          </div>
        ) : null}
        <DataTablePageSizeMenu
          pageSize={pageSize}
          pageSizes={SLOT_TABLE_PAGE_SIZES}
          onPageSizeChange={(size) => {
            if (!isSlotTablePageSize(size)) return;
            writeSlotTablePageSize(size);
            setPageSize(size);
          }}
        />
        <span className="ml-auto inline-flex shrink-0 items-stretch">
          <div role="group" aria-label="Row size" className="inline-flex items-stretch border-l border-mode-edge">
            {LEDGER_ROW_ZOOMS.map((step) => (
              <button
                key={step}
                type="button"
                aria-pressed={zoom === step}
                aria-label={LEDGER_ZOOM_LABEL[step]}
                data-testid={`ledger-zoom-${step}`}
                onClick={() => setZoom(step)}
                className={cn(
                  'ds-raw-button inline-flex w-8 items-center justify-center border-r border-mode-edge',
                  LEDGER_HIT_CLASS,
                  LEDGER_LABEL_CLASS,
                  focusRing('cell'),
                  zoom === step ? 'bg-mode-ink text-mode-bar' : 'text-mode-muted hover:bg-mode-hover',
                )}
              >
                {step}
              </button>
            ))}
          </div>
          <DataTableFullscreenToggle />
        </span>
      </div>

      {banner}

      {/* ── Records ────────────────────────────────────────────────────────── */}
      <div
        {...{ [SLOT_TABLE_OVERLAY_HOST_ATTR]: '' }}
        className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div data-slot-table-prefix="" className="relative z-sticky w-full min-w-0 shrink-0">
          <div
            {...{ [SLOT_TABLE_ACTION_ROW_ATTR]: '' }}
            data-testid="slot-table-action-row"
            className="w-full min-w-0 overflow-hidden empty:hidden"
          />
          <OrdersMorphingHost records={displayedRecords} selectedIds={plane.selectedIds} />
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {items.length === 0 ? (
            loading || searchPending ? (
              <OrdersLedgerStandIn rows={[]} zoom={zoom} />
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center gap-2 border-b border-mode-ink text-center">
                {isNarrowed ? (
                  <OrderSearchEmptyState
                    query={searchValue}
                    title={searchEmptyTitle}
                    resultLabel={searchResultLabel}
                    clearLabel={clearSearchLabel}
                    onClear={() => chrome.search.onChange('')}
                  />
                ) : (
                  <>
                    <b className="text-role-body font-bold text-mode-ink">No orders to ship</b>
                    <span className={cn(LEDGER_LABEL_CLASS, 'text-mode-muted')}>Queue clear</span>
                  </>
                )}
              </div>
            )
          ) : (
            <div
              role="list"
              aria-label="Orders to ship"
              aria-busy={loading || searchPending}
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((v) => {
                const item = items[v.index];
                if (!item) return null;
                return (
                  <div
                    key={v.key}
                    role="listitem"
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${v.start}px)` }}
                  >
                    {item.kind === 'group' ? (
                      <LedgerGroupRecord
                        group={item.group}
                        state={item.state}
                        folded={item.folded}
                        zoom={zoom}
                        selectedIds={plane.selectedIds}
                        onToggleFold={toggleFold}
                        onToggleGroup={plane.handleToggleGroup}
                      />
                    ) : (
                      <LedgerRecord
                        record={item.record}
                        state={item.state}
                        groupState={item.groupState}
                        zoom={zoom}
                        open={openId === Number(item.record.id)}
                        checked={plane.selectedIds.has(Number(item.record.id))}
                        todayKey={feed.todayKey}
                        getStaffName={feed.getStaffName}
                        onRowAction={plane.handleRowAction}
                        onToggleSelect={plane.handleToggleSelect}
                        commits={commits}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TableStatusBar
        shown={paged.shown}
        total={paged.total}
        selected={selectedCount}
        pager={{
          pageIndex: paged.pageIndex,
          pageCount: paged.pageCount,
          onPrev: () => setPageIndex((i) => Math.max(0, i - 1)),
          onNext: () => {
            if (paged.pageIndex < paged.pageCount - 1) {
              setPageIndex(paged.pageIndex + 1);
              return;
            }
            onLoadMore?.();
            setPageIndex(paged.pageIndex + 1);
          },
          nextDisabled: paged.pageIndex >= paged.pageCount - 1 && !onLoadMore,
        }}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

// ── Seed group parent ───────────────────────────────────────────────────────

const LedgerGroupRecord = memo(function LedgerGroupRecord({
  group,
  state,
  folded,
  zoom,
  selectedIds,
  onToggleFold,
  onToggleGroup,
}: {
  group: RowGroup<ShippedOrder>;
  state: LifecycleState;
  folded: boolean;
  zoom: LedgerRowZoom;
  selectedIds: ReadonlySet<number>;
  onToggleFold: (key: string) => void;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
}) {
  const ids = group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : ('mixed' as const);
  const lead = group.rows[0]!;
  const orderId = String(lead.order_id || group.key || '').trim();
  const { boxCount } = orderCarrierBoxes(group.rows);
  const { qty, amount } = parentOrderLineTotals(group.rows);
  const inState = group.rows.filter((row) => recordState(row) === state).length;
  const meta = resolveMarketplacePlatformMeta(orderId, lead.account_source);
  const spec = LIFECYCLE[state];

  return (
    <div
      data-order-group-key={group.key}
      className={cn(
        'relative flex border-b border-mode-ink bg-mode-bar',
        LEDGER_GROUP_CLASS[zoom],
        state === 'outOfStock' && LIFECYCLE_CLASSES.outOfStock.tint,
      )}
    >
      <span
        className={cn(
          LEDGER_SPINE_CLASS,
          LIFECYCLE_CLASSES[state].dot,
          state === 'outOfStock' && LEDGER_SPINE_HATCH_CLASS,
        )}
        aria-hidden
      />
      <button
        type="button"
        aria-expanded={!folded}
        aria-label={`${folded ? 'Expand' : 'Collapse'} order ${orderId}, ${group.rows.length} lines`}
        onClick={() => onToggleFold(group.key)}
        className={cn(
          'ds-raw-button inline-flex w-8 shrink-0 items-center justify-center text-mode-muted hover:bg-mode-hover',
          LEDGER_HIT_CLASS,
          focusRing('cell'),
        )}
      >
        {folded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      <GridRowCheckbox
        checked={checked}
        onToggle={() => onToggleGroup(ids, checked !== true)}
        label={`Select all ${group.rows.length} lines of order ${orderId}`}
        className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
      />
      <div className={cn('flex min-w-0 flex-1 items-center gap-3 px-2', LEDGER_BAND_CLASS[zoom])}>
        <span className={cn(LEDGER_LABEL_CLASS, 'w-16 shrink-0', stateCodeClass(state))}>
          <span aria-hidden>
            {spec.code} {inState}/{group.rows.length}
          </span>
          <span className="sr-only">
            {spec.label}: {inState} of {group.rows.length} lines
          </span>
        </span>
        <span className="inline-flex w-24 shrink-0 items-center gap-1.5">
          <BrandIdentityDot {...platformMetaBrandDot(meta)} />
          <span className={cn(LEDGER_LABEL_CLASS, 'truncate text-mode-muted')}>{meta.label || '—'}</span>
        </span>
        <span
          className={cn(LEDGER_ID_CLASS, LEDGER_NESTED_HIT_CLASS, 'flex w-40 shrink-0 items-center truncate')}
          onClick={stop}
          onPointerDown={stop}
        >
          <OrderNumberMenuChip
            value={orderId}
            platformLabel={meta.value ? meta.label : null}
            openHref={marketplaceOrderUrl(orderId, lead.account_source)}
            plain
            dense
          />
        </span>
        <span className={cn(LEDGER_LABEL_CLASS, 'text-mode-muted')}>
          {boxCount} {boxCount === 1 ? 'box' : 'boxes'} · {group.rows.length} lines
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-3">
          <span className={cn(LEDGER_LABEL_CLASS, orderRowQtyTone(qty))}>QTY {qty}</span>
          <span className={cn(LEDGER_ID_CLASS, 'w-20 text-right')}>
            {amount == null ? '—' : formatCurrency(amount)}
          </span>
        </span>
      </div>
    </div>
  );
});

// ── One record ──────────────────────────────────────────────────────────────

interface LedgerRecordProps {
  record: ShippedOrder;
  state: LifecycleState;
  groupState: LifecycleState | null;
  zoom: LedgerRowZoom;
  open: boolean;
  checked: boolean;
  todayKey: string;
  getStaffName: (id: number) => string;
  onRowAction: (
    record: ShippedOrder,
    event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null },
  ) => void;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  commits: OrdersQueueCommits;
}

const LedgerRecord = memo(function LedgerRecord({
  record,
  state,
  groupState,
  zoom,
  open,
  checked,
  todayKey,
  getStaffName,
  onRowAction,
  onToggleSelect,
  commits,
}: LedgerRecordProps) {
  const r = record as QueueRowRecord;
  const staff = queueRowStaff(r, getStaffName);
  const view = ordersCompoundView(record, {
    stateLabel: null,
    delayDays: daysLateOn(
      todayKey,
      (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
    ),
    todayKey,
  });
  const spec = LIFECYCLE[state];
  const orderId = view.orderId ?? '';
  const meta = resolveMarketplacePlatformMeta(orderId, view.platformValue);
  const qty = Number(record.quantity);
  const qtyFace = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const amount = Number(record.sale_amount);
  const price = record.sale_amount != null && Number.isFinite(amount) ? formatCurrency(amount) : '—';
  const bin = view.detail?.location ?? null;
  const next = view.nextStep ?? null;

  const pickFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.picked', staff));
  const packFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.packed', staff));

  const shipBy = (
    <LedgerShipBy
      dateKey={view.delay?.dateKey ?? null}
      overdueDays={view.delay?.overdue ? view.delay.days : 0}
      dueToday={Boolean(view.delay?.dueToday)}
      tip={view.delayTip}
      onCommit={(key) => commits.handleCommitShipBy(record, key)}
    />
  );
  const pick = (
    <LedgerStageAssign
      verb="Pick"
      doneVerb="Picked"
      role="technician"
      facts={pickFacts}
      selectedStaffId={staff.testerId}
      assignedName={staff.testerDisplay}
      onCommit={(id, name) => commits.handleCommitStageAssign(record, 'orders.picked', id, name)}
    />
  );
  const pack = (
    <LedgerStageAssign
      verb="Pack"
      doneVerb="Packed"
      role="packer"
      facts={packFacts}
      selectedStaffId={staff.packerId}
      assignedName={staff.packerDisplay}
      onCommit={(id, name) => commits.handleCommitStageAssign(record, 'orders.packed', id, name)}
    />
  );
  const code = (
    <span className={cn(LEDGER_LABEL_CLASS, 'w-9 shrink-0', stateCodeClass(state))}>
      <span aria-hidden>{spec.code}</span>
      <span className="sr-only">{spec.label}</span>
    </span>
  );
  const orderChip = (
    <span
      className={cn(LEDGER_ID_CLASS, LEDGER_NESTED_HIT_CLASS, 'flex w-40 shrink-0 items-center truncate')}
      onClick={stop}
      onPointerDown={stop}
    >
      <OrderNumberMenuChip
        value={orderId}
        platformLabel={meta.value ? meta.label : null}
        openHref={marketplaceOrderUrl(orderId, view.platformValue)}
        plain
        dense
      />
    </span>
  );
  const check = (
    <GridRowCheckbox
      checked={checked}
      onToggle={(event) => onToggleSelect(record, event)}
      label={`Select order ${orderId || record.id}`}
      className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
    />
  );

  return (
    <div
      data-order-row-id={record.id}
      data-state={state}
      className={cn(
        'group/record relative flex border-b border-mode-ink bg-mode-panel hover:bg-mode-hover',
        LEDGER_ROW_CLASS[zoom],
        state === 'outOfStock' && LIFECYCLE_CLASSES.outOfStock.tint,
        (open || checked) && 'outline outline-2 -outline-offset-2 outline-mode-ink',
      )}
    >
      {/*
        The row's open target: a stretched button under the record, so the whole
        row opens the triage rail and keyboard / AT get one stop per record. The
        record sits above it with pointer-events off; controls turn them back on
        and stop propagation, so a check or an edit never also opens.
      */}
      <button
        type="button"
        data-ledger-open=""
        aria-label={`Order ${orderId || record.id}, ${spec.label}, ${record.product_title || 'item'}`}
        aria-current={open || undefined}
        onClick={(event) =>
          onRowAction(record, { shiftKey: event.shiftKey, detail: event.detail, target: event.target })
        }
        className={cn('absolute inset-0 z-0 cursor-pointer', focusRing('cell'))}
      />
      {groupState ? (
        <>
          <span
            className={cn(
              LEDGER_SPINE_CLASS,
              'relative z-10',
              LIFECYCLE_CLASSES[groupState].dot,
              groupState === 'outOfStock' && LEDGER_SPINE_HATCH_CLASS,
            )}
            aria-hidden
          />
          <span className={cn(LEDGER_CHILD_INDENT_CLASS, 'relative z-10 border-r border-mode-rule bg-mode-well')} aria-hidden />
        </>
      ) : null}
      <span
        className={cn(
          LEDGER_SPINE_CLASS,
          'pointer-events-none relative z-10',
          LIFECYCLE_CLASSES[state].dot,
          state === 'outOfStock' && LEDGER_SPINE_HATCH_CLASS,
        )}
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none relative z-10 shrink-0 overflow-hidden border-r border-mode-rule bg-mode-well',
          LEDGER_PHOTO_CLASS[zoom],
        )}
      >
        {view.thumbUrl ? (
          <Image
            src={view.thumbUrl}
            alt=""
            fill
            unoptimized
            sizes="108px"
            className="object-cover"
          />
        ) : (
          <span
            className={cn(
              'flex h-full w-full items-center justify-center font-mono font-black text-mode-muted',
              zoom === 'S' ? 'text-role-micro' : 'text-role-body',
            )}
            aria-hidden
          >
            {initials(view.title)}
          </span>
        )}
      </span>

      {zoom === 'S' ? (
        <div
          className={cn(
            'pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-2 pr-2',
            LEDGER_BAND_CLASS.S,
          )}
        >
          <span className="pointer-events-auto">{check}</span>
          {code}
          <span className="pointer-events-auto">{orderChip}</span>
          <span className={cn(LEDGER_TITLE_CLASS, 'flex-1')}>{view.title || '—'}</span>
          <span className={cn(LEDGER_LABEL_CLASS, 'w-14 shrink-0 text-right', orderRowQtyTone(qtyFace))}>
            QTY {qtyFace}
          </span>
          <span className="pointer-events-auto w-28 shrink-0">{shipBy}</span>
          <span className="pointer-events-auto w-32 shrink-0">{pick}</span>
          <span className="pointer-events-auto w-32 shrink-0">{pack}</span>
        </div>
      ) : (
        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
          {/* Band 1 — context */}
          <div className={cn('flex min-w-0 items-center gap-3 border-b border-mode-rule pl-2', LEDGER_BAND_CLASS[zoom])}>
            {code}
            <span className="inline-flex w-24 shrink-0 items-center gap-1.5">
              <BrandIdentityDot {...platformMetaBrandDot(meta)} />
              <span className={cn(LEDGER_LABEL_CLASS, 'truncate text-mode-muted')}>{meta.label || '—'}</span>
            </span>
            <span className="pointer-events-auto">{orderChip}</span>
            <span className={cn(LEDGER_LABEL_CLASS, 'min-w-0 flex-1 truncate text-mode-muted')}>
              {bin ? `BIN ${bin}` : ''}
            </span>
            <span className="pointer-events-auto h-full w-32 shrink-0 border-l border-mode-edge">{shipBy}</span>
          </div>
          {/* Band 2 — identity */}
          <div className={cn('flex min-w-0 items-center gap-3 border-b border-mode-rule pl-2', LEDGER_BAND_CLASS[zoom])}>
            <span className={cn(LEDGER_TITLE_CLASS, 'flex-1')} title={view.title || undefined}>
              {view.title || '—'}
            </span>
            <span className="pointer-events-auto w-24 shrink-0">
              <LedgerCondition
                value={record.condition ?? null}
                onCommit={(value) => commits.handleCommitCondition(record, value)}
              />
            </span>
            <span className="pointer-events-auto h-full w-24 shrink-0 border-l border-mode-edge">
              <LedgerQty
                value={qtyFace}
                onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.qty', value)}
              />
            </span>
          </div>
          {/* Band 3 — facts */}
          <div className={cn('flex min-w-0 items-center gap-3', LEDGER_BAND_CLASS[zoom])}>
            <span className="pointer-events-auto">{check}</span>
            <span className={cn(LEDGER_ID_CLASS, 'w-20 shrink-0 text-right')}>{price}</span>
            <span className={cn(LEDGER_LABEL_CLASS, 'w-36 shrink-0 truncate text-mode-muted')}>
              SKU <span className={cn(LEDGER_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{view.detail?.sku ?? '—'}</span>
            </span>
            <span className="pointer-events-auto w-40 shrink-0">{pick}</span>
            <span className="pointer-events-auto w-40 shrink-0">{pack}</span>
            <span className="pointer-events-auto min-w-0 flex-1">
              <LedgerNote
                value={String(record.notes ?? '')}
                onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.notes', value)}
              />
            </span>
            <span
              title={next?.tip}
              className={cn(
                LEDGER_LABEL_CLASS,
                'flex h-full w-32 shrink-0 items-center border-l border-mode-edge px-2',
                next?.blocked ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink',
              )}
            >
              {next?.label ?? ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

function stageFacts(value: CompoundSlotValue | null): CompoundStageStepFacts | null {
  return value && value.kind === 'stage_event' ? value : null;
}

// ── Inline editors (instant commit, 32px hit, never open the row) ───────────

function LedgerShipBy({
  dateKey,
  overdueDays,
  dueToday,
  tip,
  onCommit,
}: {
  dateKey: string | null;
  overdueDays: number;
  dueToday: boolean;
  tip?: string;
  onCommit: (dateKey: string) => void;
}) {
  const current = (dateKey ?? '').trim();
  const face =
    overdueDays > 0
      ? `LATE ${overdueDays}d`
      : dueToday
        ? 'DUE TODAY'
        : current
          ? `SHIP ${formatDateKeyShort(current)}`
          : 'SHIP BY —';
  return (
    <HoverTooltip label={tip ?? 'Ship by'} asChild>
      <div className="h-full w-full" onClick={stop} onPointerDown={stop}>
        <DateRangePickerField
          variant="compact"
          ariaLabel="Ship by"
          clickCursor
          value={dateKeyToLocalDate(current)}
          faceLabel={face}
          onChange={(day) => {
            const key = localDateToDateKey(day);
            if (!key || key === current) return;
            onCommit(key);
          }}
          className={cn(
            'h-full min-h-mode-hit w-full gap-1 rounded-none border-0 bg-transparent px-2 py-0 shadow-none',
            'hover:border-0 hover:bg-mode-hover',
            LEDGER_LABEL_CLASS,
            overdueDays > 0 ? STATE_TONE_CLASSES.danger.text : dueToday ? 'text-mode-ink' : 'text-mode-muted',
          )}
        />
      </div>
    </HoverTooltip>
  );
}

function LedgerStageAssign({
  verb,
  doneVerb,
  role,
  facts,
  selectedStaffId,
  assignedName,
  onCommit,
}: {
  verb: string;
  doneVerb: string;
  role: 'technician' | 'packer';
  facts: CompoundStageStepFacts | null;
  selectedStaffId: number | null;
  /** Assignee face (`---` = nobody) — shown until the step is stamped. */
  assignedName: string;
  onCommit: (staffId: number | null, staffName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const assign = { selectedStaffId, label: verb, role, onCommit };
  const done = Boolean(facts?.at);
  const assignable = canAssignCompoundStage(assign, facts?.at);
  const actorId = facts?.whoStaffId ?? selectedStaffId;
  const actorName =
    (facts?.who ?? '').trim() ||
    (selectedStaffId && assignedName !== '---' ? assignedName : '') ||
    null;
  const hasActor = Boolean(actorId || actorName);
  const tip = formatCompoundStageStepLine(facts);

  const face = (
    <>
      {hasActor ? (
        <StaffAvatar staffId={actorId} name={actorName} avatarPhotoId={null} size="xs" colorRing alt={actorName ?? undefined} />
      ) : (
        <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border border-dashed border-mode-edge" />
      )}
      <span className={cn(LEDGER_LABEL_CLASS, done ? 'text-mode-ink' : 'text-mode-muted')}>
        {done ? doneVerb : verb}
      </span>
      <span className="min-w-0 truncate text-role-caption text-mode-muted">
        {actorName ?? (hasActor ? '' : '—')}
      </span>
    </>
  );

  const body = assignable ? (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={hasActor ? `Reassign ${verb}` : `Assign ${verb}`}
      data-testid={`ledger-assign-${role}`}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((v) => !v);
      }}
      onPointerDown={stop}
      className={cn(
        'ds-raw-button flex h-full w-full min-w-0 items-center gap-1.5 px-1 text-left hover:bg-mode-hover',
        LEDGER_HIT_CLASS,
        focusRing('cell'),
      )}
    >
      {face}
    </button>
  ) : (
    <span className={cn('flex h-full w-full min-w-0 items-center gap-1.5 px-1', LEDGER_HIT_CLASS)}>{face}</span>
  );

  return (
    <>
      {tip && !assignable ? (
        <HoverTooltip label={tip} asChild>
          {body}
        </HoverTooltip>
      ) : (
        body
      )}
      {assignable ? (
        <StageStaffAssignPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          label={verb}
          role={role}
          selectedStaffId={selectedStaffId}
          onCommit={onCommit}
        />
      ) : null}
    </>
  );
}

function LedgerCondition({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = resolveConditionGrade(value);
  const label = conditionGradeTableLabel(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Condition, ${label}`}
          data-testid="ledger-condition"
          onClick={stop}
          onPointerDown={stop}
          className={cn(
            'ds-raw-button flex h-full w-full items-center px-1 text-left hover:bg-mode-hover',
            LEDGER_HIT_CLASS,
            LEDGER_LABEL_CLASS,
            focusRing('cell'),
            conditionGradeTextClass(value),
          )}
        >
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={0} className="w-48 rounded-none p-0.5" onClick={stop}>
        <ul role="listbox" aria-label="Condition" className="flex flex-col">
          {CONDITION_OPTIONS.map((opt, index) => (
            <li key={opt.value}>
              <ToolbarListboxOption
                index={index}
                selected={current === opt.value}
                checkAlign="end"
                onClick={() => {
                  setOpen(false);
                  if (current !== opt.value) onCommit(opt.value);
                }}
              >
                <span className={opt.toneClass}>{opt.label}</span>
              </ToolbarListboxOption>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function LedgerQty({ value, onCommit }: { value: number; onCommit: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n === value) return;
    onCommit(String(n));
  };
  if (editing) {
    return (
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        autoFocus
        aria-label="Quantity"
        data-testid="ledger-qty-input"
        value={draft}
        onClick={stop}
        onPointerDown={stop}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setEditing(false);
        }}
        className={cn(
          'h-full w-full rounded-none border-0 bg-mode-panel px-2 text-right outline outline-2 -outline-offset-2 outline-mode-ink',
          LEDGER_ID_CLASS,
        )}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Quantity ${value}, edit`}
      data-testid="ledger-qty"
      onClick={(event) => {
        event.stopPropagation();
        setDraft(String(value));
        setEditing(true);
      }}
      onPointerDown={stop}
      className={cn(
        'ds-raw-button flex h-full w-full items-center justify-end gap-1 px-2 hover:bg-mode-hover',
        LEDGER_HIT_CLASS,
        focusRing('cell'),
      )}
    >
      <span className={cn(LEDGER_LABEL_CLASS, 'text-mode-muted')}>QTY</span>
      <span className={cn(LEDGER_ID_CLASS, orderRowQtyTone(value))}>{value}</span>
    </button>
  );
}

function LedgerNote({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const text = value.trim();
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={text ? `Note: ${text}. Add a note` : 'Add a note'}
          data-testid="ledger-note"
          onClick={stop}
          onPointerDown={stop}
          className={cn(
            'ds-raw-button flex h-full w-full min-w-0 items-center gap-1.5 px-1 text-left hover:bg-mode-hover',
            LEDGER_HIT_CLASS,
            focusRing('cell'),
          )}
        >
          <FileText className={cn('h-3.5 w-3.5 shrink-0', text ? 'text-mode-ink' : 'text-mode-muted')} aria-hidden />
          <span className="min-w-0 truncate text-role-caption text-mode-muted">{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={0} className="w-72 rounded-none p-2" onClick={stop}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const note = draft.trim();
            if (!note) return;
            onCommit(note);
            setOpen(false);
          }}
        >
          {text ? <p className="text-role-caption text-mode-muted">{text}</p> : null}
          <textarea
            autoFocus
            rows={3}
            aria-label="New note"
            data-testid="ledger-note-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
            }}
            className="w-full rounded-none border border-mode-control bg-mode-panel p-2 text-role-body text-mode-ink"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={cn(
              'ds-raw-button self-end bg-mode-ink px-3 text-mode-bar disabled:opacity-50',
              LEDGER_HIT_CLASS,
              LEDGER_LABEL_CLASS,
              focusRing('control'),
            )}
          >
            Add note
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
