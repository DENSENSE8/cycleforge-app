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

/** The Orders queue **selection / cursor plane** — the page concern lifted out of the old `OrdersGridHost` (plan Phase 1, wave 5c) so the… */
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

export interface OrdersQueuePlane {
  selectedIds: ReadonlySet<number>;
  selectedRecord: ShippedOrder | null;
  clickSelect: boolean;
  fillsById: Record<string, string>;
  handleRowAction: (
    record: ShippedOrder,
    event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null },
  ) => void;
  handleRowOpen: (record: ShippedOrder) => void;
  /** Close the open record (the record plane's ✕ / Esc) — also tells the surface via `onCloseRecord`. */
  closeRecord: () => void;
  handleToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  handleToggleGroup: (ids: readonly number[], checked: boolean) => void;
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
  // Checkbox gutter is the only bulk-select gesture. Row body opens the
  // record. Sheets click-to-select (row click toggles the set) is off.
  const clickSelect = false;
  const { fillsById } = useGridRowFills(tableId);
  const { selectedIds, toggle, selectOnly, clear, setMany } = useTableSelectMode<ShippedOrder>({
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
  /** The record the SET is currently responsible for — the one piece of state that lets the two effects below tell three superficially… */
  const railOpenedIdRef = useRef<number | null>(null);
  /** A record whose close the rail has ALREADY dispatched but which has not flushed back yet. */
  const railClosingIdRef = useRef<number | null>(null);

  // Derive the open record from the set.
  useEffect(() => {
    // Checkbox-only bulk: the check-set does not own the open record.
    if (!clickSelect) return;
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
      // Checked but not on screen — a deep link whose rows have not landed, or a refetch in flight.
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
    dispatchCloseShippedDetails();
  }, [clickSelect, railOccupancy, selectedRecordId, displayedRecords, openRecord, closeRecord, clear]);

  // Adopt an externally-opened record into the set, so every entry path lands on the same single selection SoT.
  useEffect(() => {
    if (!clickSelect) return;
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
  }, [clickSelect, railSelection, selectedRecordId, selectOnly, selectedIds]);

  // ─── Record cursor ─────────────────────────────────────────────────────────
  /** Open a record on behalf of the cursor — open, then scroll. */
  const handleCursorOpen = useCallback(
    (record: ShippedOrder, _ctx: { intent: CursorIntent; revealFoldKey: string | null }) => {
      if (clickSelect) selectOnly(Number(record.id));
      else openRecord(record);
      scrollQueueRowIntoView(record.id);
    },
    [clickSelect, selectOnly, openRecord],
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
      if (clickSelect) selectOnly(id);
      else openRecord(record);
    },
    [clickSelect, selectOnly, openRecord],
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

      // Checkbox gutter remains the only bulk-select gesture. A row-body tap is
      // the record-open gesture: mobile and desktop now share the same V1
      // order → documents path without turning a row tap into selection.
      if (clickSelect) {
        if ((event?.detail ?? 1) > 1) return;
        if (event?.shiftKey) {
          toggle(Number(record.id), true);
          return;
        }
        toggle(Number(record.id), false);
        return;
      }
      handleRowClick(record);
    },
    [railSelection, clickSelect, handleRowClick, toggle],
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

  const handleToggleGroup = useCallback(
    (ids: readonly number[], checked: boolean) => {
      setMany(ids, checked);
    },
    [setMany],
  );

  return {
    selectedIds,
    selectedRecord,
    clickSelect,
    fillsById,
    handleRowAction,
    handleRowOpen,
    closeRecord,
    handleToggleSelect,
    handleToggleGroup,
    handleRequestReplaceTracking,
  };
}
