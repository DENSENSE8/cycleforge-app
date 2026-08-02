'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useColumnOrder } from '@/components/ui/table-column-config/useColumnOrder';
import { GridColumnDetailsPanel } from '@/components/ui/table-column-config/GridColumnDetailsPanel';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LedgerGrid, useGridColumnVisibility, useGridSurface } from '@/design-system/components/grid';
import type { TableId } from '@/lib/tables/table-columns';
import {
  TABLE_SURFACE_CLIP_CLASS,
} from '@/design-system/tokens/table-surface';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import {
  ordersQueueColumnsFor,
  ordersQueueContentMinWidthRem,
  sanitizeOrdersQueueColumnOrder,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  isQueueColumnSort,
  type QueueDisplaySortColumn,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import {
  normalizePersonName,
  resolveRowStatus,
  type OrdersQueueMode,
  type OrdersQueueSort,
  type QueueRowRecord,
} from './helpers';
import { ordersQueueColumnDefsFor } from './orders-queue-column-defs';
import { OrdersQueueTableRow } from './OrdersQueueTableRow';
import { OrdersQueueColumnHeader } from './OrdersQueueColumnHeader';
import { QueueGroupRow } from './QueueGroupRow';
import { useOrdersQueueRows } from './useOrdersQueueRows';
import { useOrdersQueueSelection } from './useOrdersQueueSelection';
import { AddTrackingPopover } from '@/components/outbound/labels/AddTrackingPopover';
import { useViewportForcedHidden } from './ViewportForcedHidden';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { resolveRailOccupancy } from '@/lib/right-rail/selection-occupancy';
import {
  useFoldState,
  useGroupFoldKeys,
  usePublishRecordCursor,
} from '@/lib/record-cursor/useRecordCursor';
import { recordIdKey } from '@/lib/record-cursor/cursor-model';
import type { CursorIntent } from '@/lib/record-cursor/cursor-model';
import { RECORD_CURSOR_PRIORITY } from '@/lib/record-cursor/store';

interface OrdersGridViewProps {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
  onClearSearch: () => void;
  emptyMessage?: string;
  /** Typed empty when zero rows and no search — replaces the faint emptyMessage. */
  firstRunEmpty?: ReactNode;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  /** Pencil multi-select chrome on rows. Shares the page's selection scope + action bar. */
  selectMode?: boolean;
  selectionScope: string;
  /**
   * Rail-selection model — **the check-set becomes the single selection SoT**
   * and the open record is derived from it (1 selected ⇒ the inspector opens on
   * that row). Off by default: this grid has seven mount sites and only the
   * three dashboard outbound lanes opt in.
   *
   * `selectionScope` cannot stand in for this. Six of the seven hosts pass
   * `DASHBOARD_ORDERS_SELECTION_SCOPE` — including Labels, Staged, and both
   * Review tables — so gating on the scope would silently change four surfaces
   * that still run the bottom capsule.
   *
   * Plan: `docs/todo/order-rail-selection-plane-PLAN.md` (D3).
   */
  railSelection?: boolean;
  /** Surface chrome (status dots, tracking/serial affordances). Default fulfillment. */
  queueMode?: OrdersQueueMode;
  /**
   * Staff-prefs identity for per-staff column config (visible fields + drag
   * order), i.e. `staff_preferences.tableColumns[tableId]`.
   *
   * Default `'orders'` for EVERY outbound lane — Pending, Tested, Packed,
   * Labels, Staged, Review, and Shipped all render the SAME column SoT
   * (`ORDERS_QUEUE_COLUMNS` / `ORDERS_QUEUE_TESTED_COLUMNS`) and already shared
   * one persisted column ORDER under `'orders'`. Splitting visibility per lane
   * while order stayed global is the surprising outcome (curate Fields on
   * Pending, drag a column on Shipped, and the two prefs disagree), so both now
   * resolve under this one id. A host that genuinely wants an independent
   * layout passes its own `tableId` and gets BOTH prefs scoped to it.
   */
  tableId?: TableId;
  /**
   * Sort for row order / Date-column banding keys. When omitted, reads `?sort=`
   * via {@link useQueueDisplaySort} (Pending / To Ship).
   */
  sort?: OrdersQueueSort;
  /**
   * Accessible name for the table — REQUIRED. `LedgerGrid` exposes
   * `role="table"`; one shared grid serves every outbound lane, so the lane must
   * name itself ("Packed orders", "Labels queue") or a screen reader announces
   * an anonymous table on all of them.
   */
  ariaLabel: string;
  /** Extra classes on the outer shell. */
  className?: string;
  /** Stable test id for the outer shell (default pending-grid-body). */
  'data-testid'?: string;
  /**
   * Page scroll ancestor (Pending under `DashboardScrollShell`). When set, the
   * grid grows with content and virtualizes against that port so KPI strips
   * scroll away and the column header sticks under pinned chrome.
   */
  scrollParentRef?: RefObject<HTMLElement | null>;
}

/**
 * Bring a stepped-to row into view.
 *
 * A DOM query, and deferred two frames — both deliberate:
 *
 *  - `LedgerGrid`'s `scrollToKey` cannot serve this. It matches `r:<key>` items,
 *    and in GROUPED mode `VirtualGroupedSections` emits only `group` items, so a
 *    leaf inside a fold is unreachable through it. Teaching it grouped-mode leaf
 *    keys is a public change to a shared grid primitive — *Ask first*.
 *  - A step may REVEAL a collapsed fold, so the row it lands on is not in the
 *    DOM yet: one frame for React to flush the fold state, one for
 *    `CollapsibleGroupRow` to mount its children. A single frame lands on the
 *    exact rows the operator most needs moved to.
 *
 * Best-effort by design: a row outside the virtualizer's window has no element,
 * and a missing scroll is a far smaller failure than a thrown step.
 */
function scrollQueueRowIntoView(id: number | string) {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-order-row-id="${String(id)}"]`);
      if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
}

/**
 * **Outbound orders spreadsheet** — composed from {@link LedgerGrid}.
 *
 * Shared by Pending, Packed, Labels, Staged, Review, and Shipped. Frozen
 * identity pane (`select · Product`) is active: `scrollX` lets date…tracking
 * scroll under the pinned pane. Absolute Date is a per-row column — no
 * floating day bands.
 */
export function OrdersGridView({
  records,
  loading,
  searchValue,
  onOpenRecord,
  onCloseRecord,
  onClearSearch,
  emptyMessage = 'No orders to ship',
  firstRunEmpty,
  searchEmptyTitle = 'Order not found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  selectionScope,
  railSelection = false,
  queueMode = 'fulfillment',
  tableId = 'orders',
  sort: sortProp,
  ariaLabel,
  className,
  'data-testid': dataTestId = 'orders-grid-body',
  scrollParentRef,
}: OrdersGridViewProps) {
  const searchParams = useSearchParams();
  const { isMobile } = useUIModeOptional();
  const { getStaffName } = useStaffNameMap();
  const { sort: urlSort, dir: urlDir, setSort } = useQueueDisplaySort();
  // Parent-supplied sort (Labels / Packed) owns row order — no URL column sort.
  const urlDriven = sortProp === undefined;
  const sort = sortProp ?? urlSort;
  const dir: QueueDisplaySortDir | null = urlDriven ? urlDir : null;

  // Mode column set (plan Phase A): the Tested lifecycle tab (or legacy
  // `?ustatus=TESTED` on station embeds) swaps to tester + tested-at layout.
  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const { active: ustatus } = useToShipStatusFilter();
  const columnMode: OrdersQueueColumnMode =
    queueMode === 'fulfillment' && (orderView === 'tested' || ustatus === 'TESTED')
      ? 'fulfillment.tested'
      : 'fulfillment.default';
  const canonicalColumns = ordersQueueColumnsFor(columnMode);

  const { orderGroupsByDate, displayedRecords } = useOrdersQueueRows({
    records,
    sort,
    dir,
    queueMode,
  });

  const { selectedRecord, handleRowClick, openRecord, closeRecord } = useOrdersQueueSelection({
    visibleRecords: displayedRecords,
    onOpenRecord,
    onCloseRecord,
  });

  const getRowId = useCallback((r: ShippedOrder) => Number(r.id), []);
  const getTableRowId = useCallback((r: ShippedOrder) => String(r.id), []);
  // Always-on left gutter (Airtable-style): checkboxes toggle the set; row-body
  // click opens the record. `selectMode` only gates visible pencil chrome.
  const { selectedIds, toggle, selectOnly, clear } = useTableSelectMode<ShippedOrder>({
    scope: selectionScope,
    selectMode: true,
    rows: displayedRecords,
    getId: getRowId,
  });
  const singleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

  // ─── Rail selection: the check-set is the only selection ───────────────────
  // Set iteration is insertion order, so this preserves the order rows were
  // picked in — which is what the compare pane's left/right columns key off.
  const railOccupancy = useMemo(
    () => (railSelection ? resolveRailOccupancy([...selectedIds]) : null),
    [railSelection, selectedIds],
  );
  const selectedRecordId = selectedRecord ? Number(selectedRecord.id) : null;
  /**
   * The record the SET is currently responsible for — the one piece of state
   * that lets the two effects below tell three superficially identical
   * situations apart:
   *
   *   set {4821} · record null · ref 4821  → the operator CLOSED it → clear
   *   set {4821} · record null · ref null  → checked, rows not landed → wait
   *   set {}     · record 4821 · ref null  → an external open (deep link,
   *                                          search jump, Recents) → adopt it
   *
   * Without it the effects fight. Closing the inspector while its row stays
   * checked made the derived-open effect immediately re-open it (the panel could
   * not be closed at all), and a naive fix for that closed the deep-linked
   * record during the one commit before the set adopts it.
   */
  const railOpenedIdRef = useRef<number | null>(null);
  /**
   * A record whose close the rail has ALREADY dispatched but which has not
   * flushed back yet. Closing is not synchronous here — it round-trips through
   * the global detail-stack event and the queue hook's bridge — so for a commit
   * or two `selectedRecordId` still names a record the rail has decided is
   * gone. `railOpenedIdRef` is null by then (the close branch nulls it), which
   * makes that record look EXTERNALLY opened to the adopt effect below: clear
   * the selection inside that window and it re-checked the row it had just
   * cleared, leaving one row selected after a Clear (a D4 violation).
   */
  const railClosingIdRef = useRef<number | null>(null);

  // Derive the open record from the set.
  useEffect(() => {
    if (!railOccupancy) return;
    if (railOccupancy.kind === 'inspect') {
      if (selectedRecordId === railOccupancy.orderId) return;
      if (selectedRecordId == null) {
        // Closed from the inspector itself (Escape, its X, close-shipped-details)
        // while the row stayed checked. Under this model an open record IS a
        // selection of one, so the close has to clear the set.
        if (railOpenedIdRef.current === railOccupancy.orderId) {
          railOpenedIdRef.current = null;
          clear();
          return;
        }
        // Never opened — fall through and open it below.
      }
      const next = displayedRecords.find((r) => Number(r.id) === railOccupancy.orderId);
      // Checked but not on screen — a deep link whose rows have not landed, or a
      // refetch in flight. Leave the current occupant alone: dropping it here is
      // exactly what used to make a reloaded row vanish, and genuine removal is
      // already owned by useOrdersQueueSelection's seen-in-this-queue guard.
      if (!next) return;
      railOpenedIdRef.current = railOccupancy.orderId;
      openRecord(next);
      return;
    }

    // 0, 2, or 3+ selected — the single-record inspector is not the right body.
    // (2 and 3+ get their own occupants in plan phases 3 and 4.)
    if (selectedRecordId == null) return;
    // Only close a record the SET opened. An externally-opened record sits here
    // for exactly one commit before the seed effect adopts it, and closing it in
    // that window is what broke `?openOrderId=` on reload.
    if (railOpenedIdRef.current !== selectedRecordId) return;
    railOpenedIdRef.current = null;
    railClosingIdRef.current = selectedRecordId;
    closeRecord();
    // …and close the GLOBAL panel, not just this hook's state.
    //
    // The rail opens a record through the detail-stack EVENT (`onOpenRecord` →
    // `dispatchOpenShippedDetails`), so `closeRecord()` — which only clears
    // local state, since no caller on this surface passes `onCloseRecord` —
    // left `detail:order` registered and merely OUTRANKED by the 2+ occupant.
    // It then re-announced itself onto `selectedRecord` through the event
    // bridge, rebuilding exactly the state this branch had just torn down
    // (`selectedRecordId` set, ref null) — which the guard above declines to
    // touch a second time. The operator saw it on the next Clear: the multi
    // occupant unregistered, the stale inspector surfaced underneath, and the
    // adopt effect below read it as an external open and re-checked its row.
    // Clearing the rail left one row selected — the precise D4 violation the
    // close branch exists to prevent. Guarded by the ref check above, so the
    // `?openOrderId=` boot window is still never closed from here.
    dispatchCloseShippedDetails();
  }, [railOccupancy, selectedRecordId, displayedRecords, openRecord, closeRecord, clear]);

  // Adopt an externally-opened record into the set, so every entry path lands on
  // the same single selection SoT. Guarded by the ref, not by set size: an
  // external jump SHOULD replace a live multi-select, but a clear must not
  // resurrect the row it just closed.
  //
  // Also skip when the set ALREADY contains the open id. Without that, the
  // 1→2 checkbox path races: derive-open closes the inspector and nulls the
  // ref, then this effect still sees selectedRecordId for one commit and
  // selectOnly-collapses the multi-set back to one row (Set ship-by "Applies
  // to 1"). True external opens (deep link / search / Recents) land with the
  // id absent from the set, so they still adopt.
  useEffect(() => {
    if (!railSelection) return;
    if (selectedRecordId == null) {
      // The close the rail dispatched has landed — stop suppressing that id.
      railClosingIdRef.current = null;
      return;
    }
    if (railOpenedIdRef.current === selectedRecordId) return;
    if (selectedIds.has(selectedRecordId)) return;
    // A record the rail is in the middle of closing is not an external open.
    // Without this, Clear during the close round-trip re-adopted the record and
    // left its row checked. See `railClosingIdRef`.
    if (railClosingIdRef.current === selectedRecordId) return;
    railOpenedIdRef.current = selectedRecordId;
    selectOnly(selectedRecordId);
  }, [railSelection, selectedRecordId, selectOnly, selectedIds]);

  // ─── Fold state + the record cursor ────────────────────────────────────────
  // `dataTestId` is the surface identity, not `selectionScope`: six of the seven
  // hosts pass the same `DASHBOARD_ORDERS_SELECTION_SCOPE` (see the prop
  // docblock), so scoping on it would let Labels and Pending overwrite each
  // other's claim and share each other's expanded folds.
  const fold = useFoldState(dataTestId, 'default-collapsed');
  const foldKeys = useGroupFoldKeys(orderGroupsByDate);
  const { reveal: revealFold } = fold;

  /**
   * Open a record on behalf of the cursor — reveal, open, then scroll.
   *
   * **The `railSelection` branch is load-bearing.** On the three dashboard
   * outbound lanes the CHECK-SET is the single selection SoT and the open record
   * is derived from it (see `resolveRailOccupancy` above). Calling `openRecord`
   * directly here would bypass the set: `railOpenedIdRef` would stay stale and
   * the adopt effect would fire `selectOnly` a commit later — the exact race the
   * two refs above exist to arbitrate. A step must go through the same door a
   * click does.
   *
   * `ctx.intent` is unused on this surface because a dashboard row click has no
   * side effect a step needs to dodge (no `scanMatchedRows` here). It is carried
   * anyway, undefaulted, because the receiving family in Phase 2 does — and a
   * default there re-creates the bug the second event name was minted to avoid.
   */
  const handleCursorOpen = useCallback(
    (record: ShippedOrder, ctx: { intent: CursorIntent; revealFoldKey: string | null }) => {
      if (ctx.revealFoldKey) revealFold(ctx.revealFoldKey);
      if (railSelection) selectOnly(Number(record.id));
      else openRecord(record);
      scrollQueueRowIntoView(record.id);
    },
    [revealFold, railSelection, selectOnly, openRecord],
  );

  const cursor = usePublishRecordCursor<ShippedOrder>({
    surfaceId: dataTestId,
    scope: 'record',
    // This grid is the primary collection wherever it mounts; it never hands the
    // scope to a sibling rail, so the claim is unconditional.
    enabled: true,
    priority: RECORD_CURSOR_PRIORITY.grid,
    order: orderGroupsByDate,
    folds: fold.folds,
    openId: selectedRecordId,
    getId: getRowId,
    onOpen: handleCursorOpen,
  });

  /**
   * Reveal the fold around an ALREADY-open record — a deep link (`?openOrderId=`)
   * or a search jump that lands inside a collapsed multi-line order.
   *
   * Fires **once per opened record**, tracked by id. Re-running it on every
   * change of `openRevealFoldKey` would fight the operator: collapsing the fold
   * that holds the open record would immediately re-expand it, and a fold the
   * operator shut is a decision, not a state to repair.
   *
   * The latch is claimed only once the cursor has ACTUALLY LOCATED the record
   * (`position !== null`). Claiming it earlier is the deep-link boot bug: a
   * `?openOrderId=` resolves and opens before the queue's own fetch lands
   * (see `railOpenedIdRef` below and `useOrdersQueueSelection.ts:73-79`), so on
   * that first commit the order is empty, `openRevealFoldKey` is null, and a
   * latch taken there makes the effect bail forever — leaving the record behind
   * a still-collapsed fold, which is plan §2.2 in new clothes.
   */
  const revealedForIdRef = useRef<string | null>(null);
  useEffect(() => {
    const key = recordIdKey(selectedRecordId);
    if (key === null) {
      revealedForIdRef.current = null;
      return;
    }
    if (revealedForIdRef.current === key) return;
    // Not found in the published order yet — no answer to latch.
    if (cursor.position === null) return;
    revealedForIdRef.current = key;
    if (cursor.openRevealFoldKey) revealFold(cursor.openRevealFoldKey);
  }, [selectedRecordId, cursor.position, cursor.openRevealFoldKey, revealFold]);

  const [columnDetailsOpen, setColumnDetailsOpen] = useState(false);

  const { order: persistedOrder, setOrder, resetOrder } = useColumnOrder(tableId);
  const sanitizedOrder = useMemo(
    () => sanitizeOrdersQueueColumnOrder(persistedOrder, canonicalColumns),
    [persistedOrder, canonicalColumns],
  );
  const shellRef = useRef<HTMLDivElement>(null);
  // Viewport priority collapse (By → Qty → Cond) — house logic, ephemeral and
  // never persisted to staff prefs.
  const forceHidden = useViewportForcedHidden(shellRef);
  // ONE visibility resolution (descriptor tier + this staffer's delta + the
  // viewport collapse above), mirrored into TanStack so the state engine stays
  // the record of which tracks render. `displayColumns` below reads back off
  // TanStack, so header / rows / group summaries / grid template all follow.
  const { columnVisibility } = useGridColumnVisibility<OrdersQueueColumn>({
    columns: canonicalColumns,
    tableId,
    forceHidden,
  });

  // URL `?sort=` stays the durable SoT; TanStack mirrors it as controlled state.
  const sortingState = useMemo<SortingState>(
    () =>
      urlDriven && isQueueColumnSort(sort) && dir
        ? [{ id: sort, desc: dir === 'desc' }]
        : [],
    [urlDriven, sort, dir],
  );
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      if (!urlDriven) return;
      const next = typeof updater === 'function' ? updater(sortingState) : updater;
      const first = next[0];
      if (first && isQueueColumnSort(first.id)) {
        setSort(first.id as QueueDisplaySortColumn, first.desc ? 'desc' : 'asc');
      }
    },
    [urlDriven, setSort, sortingState],
  );
  const handleColumnOrderChange = useCallback<OnChangeFn<string[]>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater([...sanitizedOrder]) : updater;
      setOrder(sanitizeOrdersQueueColumnOrder(next, canonicalColumns));
    },
    [sanitizedOrder, setOrder, canonicalColumns],
  );

  // Headless state waist (TanStack v8): columns + sorting + visibility + order.
  // Markup, virtualization, folds, and mutations stay house (`"use no memo"`
  // lives on the hook — consumers read its returned arrays, never table getters).
  const { table, visibleLeafColumns } = useGridSurface<ShippedOrder>({
    data: displayedRecords,
    columns: ordersQueueColumnDefsFor(columnMode),
    getRowId: getTableRowId,
    sorting: sortingState,
    onSortingChange: handleSortingChange,
    columnVisibility,
    columnOrder: sanitizedOrder,
    onColumnOrderChange: handleColumnOrderChange,
  });

  // House geometry keeps reading the Kinetic Ledger column models — mapped off
  // the TanStack visible-leaf order. Content-keyed memo so row `columns` prop
  // identity is stable across unrelated re-renders (rows are memoized on it).
  const visibleKeySig = visibleLeafColumns.map((c) => c.id).join('\0');
  const displayColumns = useMemo(
    () => {
      const byKey = new Map(canonicalColumns.map((c) => [c.key, c]));
      return visibleKeySig
        .split('\0')
        .filter(Boolean)
        .map((key) => byKey.get(key as OrdersQueueColumnKey))
        .filter((c): c is OrdersQueueColumn => Boolean(c));
    },
    [visibleKeySig, canonicalColumns],
  );

  const handleSortColumn = useCallback(
    (key: OrdersQueueColumnKey) => {
      if (!urlDriven || !isQueueColumnSort(key)) return;
      // Route the click through the TanStack column (asc ↔ desc, desc-first on
      // Age) — `handleSortingChange` writes the result back to the URL SoT.
      table.getColumn(key)?.toggleSorting();
    },
    [table, urlDriven],
  );

  const isCustomOrder = useMemo(
    () => sanitizedOrder.some((key, i) => key !== canonicalColumns[i]?.key),
    [sanitizedOrder, canonicalColumns],
  );

  const handleReorderColumns = useCallback(
    (nextMovable: OrdersQueueColumnKey[]) => {
      table.setColumnOrder(sanitizeOrdersQueueColumnOrder(nextMovable, canonicalColumns));
    },
    [table, canonicalColumns],
  );

  const handleResetColumnOrder = useCallback(() => {
    resetOrder();
    toast.success('Column order reset');
  }, [resetOrder]);

  const handleRowAction = useCallback(
    (record: ShippedOrder, event?: { shiftKey: boolean; target?: EventTarget | null }) => {
      if (!railSelection) {
        handleRowClick(record);
        return;
      }
      // Checkbox lives inside the row; if a click somehow reaches here from the
      // select gutter, bail — toggle already ran, and selectOnly would REPLACE
      // the set (multi-check collapses to the last row).
      const target = event?.target;
      if (target instanceof Element && target.closest('[data-select-gutter]')) {
        return;
      }
      const id = Number(record.id);
      // Shift extends the set from the anchor — same gesture as the checkbox.
      if (event?.shiftKey) {
        toggle(id, true);
        return;
      }
      // Re-clicking the sole selected row clears it. This preserves the
      // click-again-to-close gesture the inspector had before the open channel
      // and the check-set merged; it now clears the selection too, because under
      // this model an open record IS a selection of one.
      if (selectedIds.size === 1 && selectedIds.has(id)) {
        clear();
        return;
      }
      selectOnly(id);
    },
    [railSelection, handleRowClick, toggle, selectedIds, clear, selectOnly],
  );

  const handleToggleSelect = useCallback(
    (record: ShippedOrder, event: { shiftKey: boolean }) => {
      toggle(Number(record.id), event.shiftKey);
    },
    [toggle],
  );

  const isSearching = Boolean(searchValue.trim());
  const showFirstRun =
    Boolean(firstRunEmpty) && !loading && !isSearching && records.length === 0;

  // Scroll-surface testid pairs with the shell's (`pending-grid-body` →
  // `pending-grid-scroll`) so specs can target either without new props.
  const scrollTestId = dataTestId.endsWith('-body')
    ? dataTestId.replace(/-body$/, '-scroll')
    : `${dataTestId}-scroll`;

  const renderRow = useCallback(
    (record: ShippedOrder, stripeIndex: number, rowIndex?: number) => {
      const r = record as QueueRowRecord;
      const testerName =
        (r.tested_by_name as string | undefined) ||
        (r.tester_name as string | undefined) ||
        getStaffName(r.tested_by as number | null | undefined) ||
        getStaffName(r.tester_id as number | null | undefined);
      const packerName =
        (r.packed_by_name as string | undefined) ||
        (r.packer_name as string | undefined) ||
        getStaffName(r.packed_by as number | null | undefined) ||
        getStaffName(r.packer_id as number | null | undefined);
      const hasOutOfStock = Boolean(r.is_out_of_stock);
      const notesValue = String(r.notes || '').trim();
      return (
        <OrdersQueueTableRow
          key={record.id}
          disableEnterAnimation
          disableLayoutAnimation
          opaqueStripe
          gridSkin
          rowIndex={rowIndex}
          onToggleSelect={handleToggleSelect}
          singleSelected={singleSelectedId === Number(record.id)}
          record={r}
          isSelected={selectedRecord?.id === record.id || selectedIds.has(Number(record.id))}
          selectMode={selectMode}
          isChecked={selectedIds.has(Number(record.id))}
          isMobile={isMobile}
          useAlternateStripe={stripeIndex % 2 === 1}
          testerDisplay={normalizePersonName(testerName)}
          packerDisplay={normalizePersonName(packerName)}
          testerId={(r.tested_by as number | null) ?? (r.tester_id as number | null)}
          packerId={(r.packed_by as number | null) ?? (r.packer_id as number | null)}
          rowStatus={resolveRowStatus(r, queueMode)}
          hasOutOfStock={hasOutOfStock}
          notesValue={notesValue}
          daysLate={getDaysLateNullable(r.deadline_at as string | null | undefined)}
          queueMode={queueMode}
          columns={displayColumns}
          capabilities={ORDERS_GRID_CAPABILITIES}
          trackingAction={
            queueMode === 'labels' ? <AddTrackingPopover record={record} /> : undefined
          }
          onRowClick={handleRowAction}
        />
      );
    },
    [
      getStaffName,
      selectMode,
      selectedIds,
      selectedRecord,
      isMobile,
      handleRowAction,
      handleToggleSelect,
      displayColumns,
      singleSelectedId,
      queueMode,
    ],
  );

  const renderGroup = useCallback(
    (
      group: Parameters<typeof QueueGroupRow>[0]['group'],
      baseStripeIndex: number,
      rowIndex?: number,
    ) => {
      // Band-qualified — a multi-line order whose lines straddle two date bands
      // is two folds sharing one `group.key`, and they must toggle separately.
      const key = foldKeys.get(group);
      return (
        <QueueGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          rowIndex={rowIndex}
          isMobile={isMobile}
          gridSkin
          columns={displayColumns}
          expanded={key === undefined ? undefined : fold.isOpen(key)}
          onToggleExpanded={key === undefined ? undefined : (next) => fold.toggle(key, next)}
          renderRow={renderRow}
        />
      );
    },
    [isMobile, renderRow, displayColumns, foldKeys, fold],
  );

  return (
    <div
      ref={shellRef}
      data-testid={dataTestId}
      data-table-surface=""
      className={cn(
        // Framed ops table shell (SoT: table-surface) — always overflow-hidden
        // so airtable cell grid clips cleanly at rounded corners.
        'flex min-w-0 w-full flex-col',
        !scrollParentRef && 'h-full min-h-0 flex-1',
        TABLE_SURFACE_CLIP_CLASS,
        className,
      )}
    >
      <LedgerGrid<ShippedOrder>
        scrollX
        scrollParentRef={scrollParentRef}
        contentMinWidthRem={ordersQueueContentMinWidthRem(displayColumns)}
        gridSkin="airtable"
        aria-label={ariaLabel}
        data-testid={scrollTestId}
        orderGroupsByDate={orderGroupsByDate}
        isSearching={isSearching}
        columnHeader={
          <OrdersQueueColumnHeader
            isMobile={isMobile}
            selectMode={selectMode}
            selectionScope={selectionScope}
            gridSkin
            columns={displayColumns}
            onReorderColumns={handleReorderColumns}
            onResetColumnOrder={isCustomOrder ? handleResetColumnOrder : undefined}
            activeSort={urlDriven && isQueueColumnSort(sort) ? sort : undefined}
            sortDir={urlDriven ? dir : null}
            onSortColumn={urlDriven ? handleSortColumn : undefined}
            onOpenColumnDetails={() => setColumnDetailsOpen(true)}
            columnDetailsOpen={columnDetailsOpen}
          />
        }
        renderRow={renderRow}
        renderGroup={renderGroup}
        emptyState={
          showFirstRun ? (
            firstRunEmpty
          ) : (
            <div className="mx-auto max-w-xs rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-muted">
              {loading ? 'Loading…' : emptyMessage}
            </div>
          )
        }
        searchEmptyState={
          <OrderSearchEmptyState
            query={searchValue}
            title={searchEmptyTitle}
            resultLabel={searchResultLabel}
            clearLabel={clearSearchLabel}
            onClear={onClearSearch}
          />
        }
      />
      {/* `canonicalColumns`, not `displayColumns` — the rail must offer the
          tracks that are currently OFF, which is the only way to turn one on. */}
      <GridColumnDetailsPanel
        open={columnDetailsOpen}
        onClose={() => setColumnDetailsOpen(false)}
        tableId={tableId}
        columns={canonicalColumns}
      />
    </div>
  );
}
