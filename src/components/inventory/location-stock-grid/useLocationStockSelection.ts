'use client';

/**
 * Inventory › Stock — the desk's row selection, and the bridge onto the
 * table-selection bus.
 *
 * ## Why this is a hook and not `useTableSelectMode`
 *
 * That hook is the numeric-PK selection every order / receiving lane uses:
 * `getId: (row) => number`, `Set<number>`, and a shift-range walk over the
 * published page. A Stock row has no PK — it is a `(location, sku, source)`
 * TRIPLE (`locationStockRowId`), because a location holds many SKUs, a SKU
 * sits in many locations, and the same pair can carry both loose counted stock
 * and standing units. Squeezing that through `Number()` is how the id
 * vocabulary broke in the first place (see `slot-table-visible.ts`).
 *
 * So the state here is a `Set<string>` keyed on that id, and the rest is the
 * same contract every selectable table already keeps:
 *
 * - `emitSelection(scope, rows)` publishes the picked ROWS, which is what the
 *   status bar's "N selected" and the action strip both read.
 * - `onToggleAll(scope, …)` mirrors the column header's select-all / clear.
 * - The TOTAL is deliberately NOT emitted here: `DataTable` already publishes
 *   it for the page it paints (`emitSelectionTotal` beside
 *   `publishSlotTableVisibleIds`), and two emitters on one channel is a race
 *   whose loser makes the header checkbox lie.
 *
 * ## Shift-click is a plain toggle here, on purpose
 *
 * A range walk means "every row between the anchor and this one, in the order
 * on screen". DISPLAY order lives inside the engine (search → sort → page), and
 * this hook sits above it with the unsorted feed, so a range resolved here
 * would tick rows the operator cannot see. Select-all reads the engine's
 * published page instead, which is the same question answered by the component
 * that knows the answer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emitSelection,
  onToggleAll,
} from '@/lib/selection/table-selection';
import { slotTableSelectableIds } from '@/lib/tables/slot-table-visible';
import {
  locationStockRowId,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';

/** The one scope string, shared by the grid, the header select-all and the strip. */
export const LOCATION_STOCK_SELECTION_SCOPE = 'location-stock' as const;

export interface LocationStockSelection {
  /** The picked rows, in feed order — the strip's input. */
  rows: readonly LocationStockTableRow[];
  isSelected: (row: LocationStockTableRow) => boolean;
  toggle: (row: LocationStockTableRow) => void;
  clear: () => void;
}

export function useLocationStockSelection(
  rows: readonly LocationStockTableRow[],
): LocationStockSelection {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  // Read at event time so select-all does not have to depend on row identity —
  // the feed is a fresh array on every room toggle and search keystroke.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /**
   * Drop ids whose row left the feed (a moved pair, a zeroed count, a room
   * filter). A selection that outlives its rows would keep the strip armed
   * over stock that is no longer on screen — and would write to it.
   */
  const selected = useMemo(() => {
    const out: LocationStockTableRow[] = [];
    for (const row of rows) {
      if (ids.has(locationStockRowId(row))) out.push(row);
    }
    return out;
  }, [rows, ids]);

  useEffect(() => {
    emitSelection(LOCATION_STOCK_SELECTION_SCOPE, selected);
  }, [selected]);

  useEffect(() => {
    return onToggleAll(LOCATION_STOCK_SELECTION_SCOPE, (mode) => {
      if (mode === 'none') {
        setIds(new Set());
        return;
      }
      // The engine's PAGE, not the whole feed: select-all means the rows the
      // operator can see. `slotTableSelectableIds` falls back to the feed on a
      // mount that has not published yet.
      const page = slotTableSelectableIds(
        LOCATION_STOCK_SELECTION_SCOPE,
        rowsRef.current.map((row) => locationStockRowId(row)),
      );
      setIds(new Set(page.map((id) => String(id))));
    });
  }, []);

  const isSelected = useCallback(
    (row: LocationStockTableRow) => ids.has(locationStockRowId(row)),
    [ids],
  );

  const toggle = useCallback((row: LocationStockTableRow) => {
    const id = locationStockRowId(row);
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds((prev) => (prev.size > 0 ? new Set<string>() : prev));
  }, []);

  return { rows: selected, isSelected, toggle, clear };
}
