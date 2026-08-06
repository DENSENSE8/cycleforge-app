'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { useGridRowFills } from '@/design-system/components/grid';
import type { TableId } from '@/lib/tables/table-columns';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import {
  ordersQueueColumnsFor,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import {
  makeOrdersGridDescriptorDefault,
  makeOrdersGridDescriptorTested,
  ORDERS_GRID_CAPABILITIES,
} from '@/components/dashboard/orders-queue/orders-queue-descriptor';
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
import { OrdersQueueTableRow } from './OrdersQueueTableRow';
import { OrdersQueueColumnHeader } from './OrdersQueueColumnHeader';
import { QueueGroupRow } from './QueueGroupRow';
import { useOrdersQueueRows } from './useOrdersQueueRows';
import { useOrdersQueueSelection } from './useOrdersQueueSelection';
import { AddTrackingPopover } from '@/components/outbound/labels/AddTrackingPopover';
import { useViewportForcedHidden } from './ViewportForcedHidden';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { resolveRailOccupancy } from '@/lib/right-rail/selection-occupancy';
import { armReplaceTrackingIntent } from '@/lib/order-inspector/replace-tracking-intent';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
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
   * When on, also enables Sheets click-select (`clickSelect`): row click
   * toggles bulk, double-click opens; the select track keeps the painted
   * `'always'` checkbox gutter (header select-all + every leftmost row cell).
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
  /**
   * Inspector View topics controls portal — when set, ▦ portals there. To Ship
   * always uses portal-only mode (no card-corner hover fallback).
   */
  columnTriggerPortalTarget?: HTMLElement | null;
}

/**
 * Bring a stepped-to row into view.
 *
 * A DOM query deferred one frame — deliberate: `LedgerGrid`'s `scrollToKey`
 * matches `r:<key>` items, and in GROUPED mode `VirtualGroupedSections` emits
 * only `group` items, so a leaf is unreachable through it. Teaching it
 * grouped-mode leaf keys is a public change to a shared grid primitive —
 * *Ask first*.
 *
 * Best-effort by design: a row outside the virtualizer's window has no element,
 * and a missing scroll is a far smaller failure than a thrown step.
 */
function scrollQueueRowIntoView(id: number | string) {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-order-row-id="${String(id)}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/**
 * **Outbound orders spreadsheet** — thin domain adapter over
 * {@link LedgerGridSurface} (`surface="sheet"`).
 *
 * Shared by Pending, Packed, Labels, Staged, Review, and Shipped. Shell
 * plumbing (visibility, Fields gutter, widths, force-hide, column order) lives
 * on the surface. The allowlisted `OrdersQueueColumnHeader` fork keeps
 * drag-reorder UI; fat `OrdersQueueTableRow` keeps triage + in-cell edit.
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
  columnTriggerPortalTarget,
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
  const makeDescriptor =
    columnMode === 'fulfillment.tested'
      ? makeOrdersGridDescriptorTested
      : makeOrdersGridDescriptorDefault;

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
  // To-ship (`railSelection`): Sheets click-select — row click toggles the set;
  // double-click opens. Select track keeps the always-painted checkbox face
  // (Unbox History interactive gutter language). `selectMode` only gates
  // visible pencil chrome on non-rail mounts.
  const clickSelect = railSelection;
  const { fillsById } = useGridRowFills(tableId);
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

  // ─── Record cursor ─────────────────────────────────────────────────────────
  // Sheet body is flat leaves (no in-grid order fold). Parent rollups live only
  // on the drill parent map. Omit `folds` so the cursor treats every group as
  // open. `dataTestId` is the surface identity, not `selectionScope`: six of the
  // seven hosts pass the same `DASHBOARD_ORDERS_SELECTION_SCOPE`.

  /**
   * Open a record on behalf of the cursor — open, then scroll.
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
    (record: ShippedOrder, _ctx: { intent: CursorIntent; revealFoldKey: string | null }) => {
      if (railSelection) selectOnly(Number(record.id));
      else openRecord(record);
      scrollQueueRowIntoView(record.id);
    },
    [railSelection, selectOnly, openRecord],
  );

  /**
   * Filled-tracking menu → "Replace tracking": arm the one-shot inspector
   * intent, then open this row on the selection plane (or via openRecord when
   * the mount is not rail-selection). If the row is already the inspect
   * occupant, arm alone is enough — the panel subscriber consumes.
   */
  const handleRequestReplaceTracking = useCallback(
    (record: ShippedOrder) => {
      const id = Number(record.id);
      if (!Number.isFinite(id) || id <= 0) return;
      armReplaceTrackingIntent(id);
      if (railSelection) selectOnly(id);
      else openRecord(record);
    },
    [railSelection, selectOnly, openRecord],
  );

  usePublishRecordCursor<ShippedOrder>({
    surfaceId: dataTestId,
    scope: 'record',
    // This grid is the primary collection wherever it mounts; it never hands the
    // scope to a sibling rail, so the claim is unconditional.
    enabled: true,
    priority: RECORD_CURSOR_PRIORITY.grid,
    order: orderGroupsByDate,
    openId: selectedRecordId,
    getId: getRowId,
    onOpen: handleCursorOpen,
  });

  const shellRef = useRef<HTMLDivElement>(null);
  // Viewport priority collapse (By → Qty · Cond) — house logic, ephemeral and
  // never persisted to staff prefs. Observed on the surface shell.
  const forceHidden = useViewportForcedHidden(shellRef);

  const handleSortChange = useCallback(
    (key: OrdersQueueColumnKey, nextDir: 'asc' | 'desc') => {
      if (!urlDriven || !isQueueColumnSort(key)) return;
      setSort(key as QueueDisplaySortColumn, nextDir);
    },
    [urlDriven, setSort],
  );

  const handleRowAction = useCallback(
    (record: ShippedOrder, event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null }) => {
      if (!railSelection) {
        handleRowClick(record);
        return;
      }
      // Checkbox / spacer lives inside the row; if a click somehow reaches here
      // from the select gutter, bail — toggle already ran (or spacer is inert).
      const target = event?.target;
      if (target instanceof Element && target.closest('[data-select-gutter]')) {
        return;
      }
      const id = Number(record.id);

      // Sheets click-select: click toggles bulk; skip the second half of a
      // double-click so dblclick only opens (ReceivingGridRow parity).
      if (clickSelect) {
        if ((event?.detail ?? 1) > 1) return;
        if (event?.shiftKey) {
          toggle(id, true);
          return;
        }
        toggle(id, false);
        return;
      }

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
    [railSelection, clickSelect, handleRowClick, toggle, selectedIds, clear, selectOnly],
  );

  const handleRowOpen = useCallback(
    (record: ShippedOrder) => {
      if (clickSelect) {
        handleRowClick(record);
        return;
      }
    },
    [clickSelect, handleRowClick],
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

  const columnSort =
    urlDriven && isQueueColumnSort(sort) ? (sort as OrdersQueueColumnKey) : null;
  const columnSortDir = urlDriven && columnSort ? dir : null;

  const renderLeaf = useCallback(
    (
      record: ShippedOrder,
      stripeIndex: number,
      visible: readonly OrdersQueueColumn[],
      rowIndex?: number,
    ) => {
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
      const rowFillHex =
        clickSelect ? (fillsById[String(record.id)] ?? null) : null;
      return (
        <OrdersQueueTableRow
          key={record.id}
          disableEnterAnimation
          disableLayoutAnimation
          opaqueStripe
          gridSkin
          clickSelect={clickSelect}
          selectGutterChrome="always"
          rowFillHex={rowFillHex}
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
          daysLate={getDaysLateNullable(
            (r.deadline_at as string | null | undefined) ||
              (r.ship_by_date as string | null | undefined),
          )}
          queueMode={queueMode}
          columns={visible}
          capabilities={ORDERS_GRID_CAPABILITIES}
          trackingAction={
            queueMode === 'labels' ? <AddTrackingPopover record={record} /> : undefined
          }
          onRowClick={handleRowAction}
          onRowOpen={clickSelect ? handleRowOpen : undefined}
          onRequestReplaceTracking={
            queueMode === 'fulfillment' || queueMode === 'labels'
              ? handleRequestReplaceTracking
              : undefined
          }
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
      handleRowOpen,
      handleToggleSelect,
      handleRequestReplaceTracking,
      singleSelectedId,
      queueMode,
      clickSelect,
      fillsById,
    ],
  );

  return (
    <LedgerGridSurface
      ariaLabel={ariaLabel}
      columns={canonicalColumns}
      makeDescriptor={makeDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={displayedRecords}
      getRowId={getTableRowId}
      sort={columnSort}
      dir={columnSortDir}
      onSortChange={handleSortChange}
      loading={loading}
      emptyMessage={emptyMessage}
      emptyState={showFirstRun ? firstRunEmpty : undefined}
      searchEmptyState={
        <OrderSearchEmptyState
          query={searchValue}
          title={searchEmptyTitle}
          resultLabel={searchResultLabel}
          clearLabel={clearSearchLabel}
          onClear={onClearSearch}
        />
      }
      isSearching={isSearching}
      shellRef={shellRef}
      scrollParentRef={scrollParentRef}
      columnTriggerPortalTarget={columnTriggerPortalTarget ?? null}
      columnTriggerPortalOnly
      className={className}
      testId={dataTestId}
      tableId={tableId}
      surface="sheet"
      forceHidden={forceHidden}
      renderColumnHeader={({
        toggleColumnSort,
        onResizeColumn,
        onResetColumn,
        columns: visible,
      }) => (
        <OrdersQueueColumnHeader
          isMobile={isMobile}
          selectMode={selectMode}
          selectionScope={selectionScope}
          gridSkin
          selectGutterChrome="always"
          columns={visible}
          activeSort={columnSort && isQueueColumnSort(columnSort) ? columnSort : undefined}
          sortDir={columnSortDir}
          onSortColumn={urlDriven ? (key) => toggleColumnSort(key) : undefined}
          onResizeColumn={onResizeColumn}
          onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, baseStripeIndex, { columns: visible }) => (
        <QueueGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          renderRow={(record, stripeIndex, rowIndex) =>
            renderLeaf(record, stripeIndex, visible, rowIndex)
          }
        />
      )}
      renderRow={(record, stripeIndex, { columns: visible }, rowIndex) =>
        renderLeaf(record, stripeIndex, visible, rowIndex)
      }
    />
  );
}
