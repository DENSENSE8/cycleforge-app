'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { RowGroup } from '@/lib/group-rows';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useGridRowFills } from '@/design-system/components/grid';
import type { TableId } from '@/lib/tables/table-columns';
import { useOrdersQueueSelection } from './useOrdersQueueSelection';
import { resolveRailOccupancy } from '@/lib/right-rail/selection-occupancy';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { armReplaceTrackingIntent } from '@/lib/order-inspector/replace-tracking-intent';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { CursorIntent } from '@/lib/record-cursor/cursor-model';
import { RECORD_CURSOR_PRIORITY } from '@/lib/record-cursor/store';
import { ignoreRowSelectFromSubtitle } from '@/components/tables/compound/useSubtitlePointerReorder';

/**
 * The Orders queue **selection / cursor plane** — the page concern lifted out of
 * the old `OrdersGridHost` (plan Phase 1, wave 5c) so the grid became a
 * presentational adapter over `NonlinearTableHost`. That adapter is now the
 * `useOrdersSpreadsheet` hook, which is this hook's only caller.
 *
 * This is deliberately a VERBATIM move, not a rewrite: the two rail effects
 * encode at least four documented bug-fixes named in their comments — the D4
 * clear violation, the `?openOrderId=` boot window, the 1→2 checkbox race, and
 * the close round-trip. Reorganising them risks reintroducing every one, so the
 * logic is transplanted unchanged and only its inputs/outputs are made explicit.
 *
 * The shared home the three dashboard rail lanes call; the grid consumes what it
 * returns and no longer decides which record is open, publishes the cursor, or
 * closes the global detail-stack panel.
 */
function scrollQueueRowIntoView(id: number | string) {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-order-row-id="${String(id)}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

interface OrdersQueuePlaneArgs {
  /** Sorted, visible rows (the grid's own feed output). */
  displayedRecords: ShippedOrder[];
  /** Grouped order for the record cursor's next/prev walk. */
  orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][];
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
  selectionScope: string;
  /** Rail-selection model (three dashboard outbound lanes opt in). */
  railSelection: boolean;
  /** Surface identity for the record cursor (the grid's testid). */
  surfaceId: string;
  /** Prefs bucket for staff row fills. */
  tableId: TableId;
}

interface OrdersQueuePlane {
  selectedIds: ReadonlySet<number>;
  selectedRecord: ShippedOrder | null;
  clickSelect: boolean;
  fillsById: Record<string, string>;
  handleRowAction: (
    record: ShippedOrder,
    event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null },
  ) => void;
  handleRowOpen: (record: ShippedOrder) => void;
  handleToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  handleRequestReplaceTracking: (record: ShippedOrder) => void;
}

export function useOrdersQueuePlane({
  displayedRecords,
  orderGroupsByDate,
  onOpenRecord,
  onCloseRecord,
  selectionScope,
  railSelection,
  surfaceId,
  tableId,
}: OrdersQueuePlaneArgs): OrdersQueuePlane {
  const { selectedRecord, handleRowClick, openRecord, closeRecord } = useOrdersQueueSelection({
    visibleRecords: displayedRecords,
    onOpenRecord,
    onCloseRecord,
  });

  const getRowId = useCallback((r: ShippedOrder) => Number(r.id), []);
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
  /**
   * Open a record on behalf of the cursor — open, then scroll.
   *
   * **The `railSelection` branch is load-bearing.** On the three dashboard
   * outbound lanes the CHECK-SET is the single selection SoT and the open record
   * is derived from it. Calling `openRecord` directly here would bypass the set:
   * `railOpenedIdRef` would stay stale and the adopt effect would fire
   * `selectOnly` a commit later — the exact race the two refs above arbitrate. A
   * step must go through the same door a click does.
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
   * the mount is not rail-selection).
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
    surfaceId,
    scope: 'record',
    enabled: true,
    priority: RECORD_CURSOR_PRIORITY.grid,
    order: orderGroupsByDate,
    openId: selectedRecordId,
    getId: getRowId,
    onOpen: handleCursorOpen,
  });

  const handleRowAction = useCallback(
    (
      record: ShippedOrder,
      event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null },
    ) => {
      const target = event?.target;
      // Subtitle-band drag fires `click` on the row (common ancestor of qty →
      // condition). Bail before bulk-select AND before inspector-open; both
      // remount the grid and look like "the drag selected the row".
      if (ignoreRowSelectFromSubtitle({ target: target ?? null })) return;
      if (!railSelection) {
        handleRowClick(record);
        return;
      }
      // Checkbox / spacer lives inside the row; if a click somehow reaches here
      // from the select gutter, bail — toggle already ran (or spacer is inert).
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
      // Re-clicking the sole selected row clears it. Under this model an open
      // record IS a selection of one, so this clears the selection too.
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

  return {
    selectedIds,
    selectedRecord,
    clickSelect,
    fillsById,
    handleRowAction,
    handleRowOpen,
    handleToggleSelect,
    handleRequestReplaceTracking,
  };
}
