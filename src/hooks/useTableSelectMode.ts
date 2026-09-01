'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emitSelection,
  emitSelectionTotal,
  onToggleAll,
} from '@/lib/selection/table-selection';
import {
  clearSelection,
  extendTo,
  selectAll,
  selectOnlyAt,
  toggleAt,
  type SelectionAnchorState,
} from '@/lib/selection/selection-anchor';

/**
 * Table-side wiring for always-on multi-select (left-gutter checkboxes → act),
 * factored out of {@link ReceivingLinesTable} so any list can opt in with one call.
 *
 * Owns the checked-id set and:
 *   • broadcasts the resolved selected rows on `scope` (for useTableSelection),
 *   • mirrors the header Select-all / Clear toggle (onToggleAll),
 *   • publishes the selectable total so the action bar's ring can fill,
 *   • clears the selection when select mode turns off.
 *
 * The owning page keeps selectMode always on for selectable surfaces and mounts
 * the right-rail selection plane; the table just calls this with its visible rows.
 *
 * `rows` / `getId` are read through refs so the broadcast fires only when the
 * *selection* changes — not on every parent re-render. That matters because the
 * page collects the broadcast into React state (useTableSelection); re-emitting
 * on each render would ping-pong page → table → page in a loop. Callers
 * therefore need NOT memoize `rows`.
 */
export function useTableSelectMode<T>({
  scope,
  selectMode,
  rows,
  getId,
}: {
  /** Shared with the page's useTableSelection + the action bar. */
  scope: string;
  /** True while left-gutter checkboxes are live (always-on for selectable surfaces). */
  selectMode: boolean;
  /** Visible rows in render order — drives Select-all + the broadcast payload. */
  rows: T[];
  /** Row → stable numeric id (the checkbox key). */
  getId: (row: T) => number;
}): {
  selectedIds: ReadonlySet<number>;
  /** Toggle one row. Pass `extend` (shift-click) to apply the clicked row's NEW
   *  state to every visible row between the last-clicked anchor and this one. */
  toggle: (id: number, extend?: boolean) => void;
  /**
   * Replace the whole set with exactly this row.
   *
   * The rail-selection model (dashboard orders) needs a plain row-body click to
   * MEAN "select only this" — the check-set is the single selection SoT there,
   * so a click that merely added would grow a batch the operator never asked
   * for. Distinct from `toggle`, which is the checkbox gesture.
   */
  selectOnly: (id: number) => void;
  /** Check every row in the current view — ⌘A. */
  selectEvery: () => void;
  /** Drop every checked row (the rail's close / the header's Clear). */
  clear: () => void;
  isSelected: (id: number) => boolean;
} {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  // Latest rows / id-accessor, read at emit time so the effects below don't
  // have to depend on `rows` identity (see the loop note in the docblock).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const getIdRef = useRef(getId);
  getIdRef.current = getId;
  // Last-clicked row id — the anchor for shift-click range select.
  const anchorRef = useRef<number | null>(null);

  /**
   * Read the current gesture's inputs for {@link selection-anchor}.
   *
   * `ids` is DISPLAY order — the order on screen after sort and filter — which
   * is what a span between two rows means to the operator.
   */
  const anchorStateFor = useCallback(
    (selected: ReadonlySet<number>): SelectionAnchorState => ({
      ids: rowsRef.current.map((r) => getIdRef.current(r)),
      selected,
      anchorId: anchorRef.current,
    }),
    [],
  );

  /**
   * Apply one anchor result. Returning `prev` when nothing changed is not an
   * optimisation — the page collects the broadcast into React state, so a fresh
   * Set for a no-op gesture would re-render the grid and re-emit the same
   * selection (the ping-pong this hook's docblock warns about).
   */
  const applyAnchor = useCallback(
    (run: (state: SelectionAnchorState) => ReturnType<typeof toggleAt>) => {
      setSelectedIds((prev) => {
        const result = run(anchorStateFor(prev));
        anchorRef.current = result.anchorId;
        return result.changed ? (result.selected as Set<number>) : prev;
      });
    },
    [anchorStateFor],
  );

  // The RANGE WALK used to live inline here, reachable only from a pointer
  // event. Shift+↑/↓ is the same gesture with a different input device, so it
  // moved to `selection-anchor` where both call one implementation — and where
  // it can be tested without mounting React.
  const toggle = useCallback(
    (id: number, extend = false) => {
      applyAnchor((state) => (extend ? extendTo(state, id) : toggleAt(state, id)));
    },
    [applyAnchor],
  );

  const selectOnly = useCallback(
    (id: number) => {
      applyAnchor((state) => selectOnlyAt(state, id));
    },
    [applyAnchor],
  );

  /** ⌘A — every row in the CURRENT view, which is what the operator can see. */
  const selectEvery = useCallback(() => {
    applyAnchor((state) => selectAll(state));
  }, [applyAnchor]);

  const clear = useCallback(() => {
    applyAnchor((state) => clearSelection(state));
  }, [applyAnchor]);

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds]);

  // Broadcast the resolved selected rows whenever the checked set changes.
  useEffect(() => {
    if (!selectMode) return;
    const byId = new Map(rowsRef.current.map((r) => [getIdRef.current(r), r] as const));
    const out: T[] = [];
    for (const id of selectedIds) {
      const row = byId.get(id);
      if (row) out.push(row);
    }
    emitSelection(scope, out);
  }, [scope, selectMode, selectedIds]);

  // Leaving select mode clears the selection (and notifies listeners).
  useEffect(() => {
    if (selectMode) return;
    anchorRef.current = null;
    setSelectedIds((prev) => (prev.size ? new Set() : prev));
    emitSelection(scope, []);
  }, [scope, selectMode]);

  // Header "Select all" / "Clear" → toggle every currently-visible row.
  useEffect(() => {
    return onToggleAll(scope, (mode) => {
      if (mode !== 'all') anchorRef.current = null;
      setSelectedIds(
        mode === 'all'
          ? new Set(rowsRef.current.map((r) => getIdRef.current(r)))
          : new Set(),
      );
    });
  }, [scope]);

  // Publish the selectable total so the action bar's select-all ring can fill.
  // Zero outside select mode so a stale "all selected" never lingers.
  useEffect(() => {
    emitSelectionTotal(scope, selectMode ? rows.length : 0);
  }, [scope, selectMode, rows.length]);

  return { selectedIds, toggle, selectOnly, selectEvery, clear, isSelected };
}
