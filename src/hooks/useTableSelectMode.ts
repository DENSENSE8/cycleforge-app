'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emitSelection,
  emitSelectionTotal,
  onToggleAll,
} from '@/lib/selection/table-selection';
import { dataTableSelectableIds } from '@/lib/tables/data-table-visible-rows';
import {
  clearSelection,
  extendTo,
  selectAll,
  selectOnlyAt,
  setMany,
  toggleAt,
  type SelectionAnchorResult,
  type SelectionAnchorState,
} from '@/lib/selection/selection-anchor';

/** Table-side wiring for always-on multi-select (left-gutter checkboxes → act), factored out of {@link ReceivingLinesTable} so any list can… */
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
  /** Replace the whole set with exactly this row. */
  selectOnly: (id: number) => void;
  /** Check every row in the current view — ⌘A. */
  selectEvery: () => void;
  /** Drop every checked row (the rail's close / the header's Clear). */
  clear: () => void;
  /** Check or uncheck a named set (order-parent checkbox) without replacing the rest. */
  setMany: (ids: readonly number[], checked: boolean) => void;
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
      ids: [...dataTableSelectableIds(
        scope,
        rowsRef.current.map((r) => getIdRef.current(r)),
      )],
      selected,
      anchorId: anchorRef.current,
    }),
    [scope],
  );

  /** Apply one anchor result. */
  const applyAnchor = useCallback(
    (run: (state: SelectionAnchorState) => SelectionAnchorResult<number>) => {
      setSelectedIds((prev) => {
        const result = run(anchorStateFor(prev));
        anchorRef.current = result.anchorId;
        return result.changed ? (result.selected as Set<number>) : prev;
      });
    },
    [anchorStateFor],
  );

  // The RANGE WALK used to live inline here, reachable only from a pointer event.
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

  const setManyIds = useCallback(
    (ids: readonly number[], checked: boolean) => {
      applyAnchor((state) => setMany(state, ids, checked));
    },
    [applyAnchor],
  );

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
  useEffect(() => {
    return onToggleAll(scope, (mode) => {
      if (mode !== 'all') anchorRef.current = null;
      const ids = dataTableSelectableIds(
        scope,
        rowsRef.current.map((r) => getIdRef.current(r)),
      );
      setSelectedIds(mode === 'all' ? new Set(ids) : new Set());
    });
  }, [scope]);

  useEffect(() => {
    emitSelectionTotal(
      scope,
      selectMode
        ? dataTableSelectableIds(
            scope,
            rowsRef.current.map((r) => getIdRef.current(r)),
          ).length
        : 0,
    );
  }, [scope, selectMode, rows.length]);

  return { selectedIds, toggle, selectOnly, selectEvery, clear, setMany: setManyIds, isSelected };
}
