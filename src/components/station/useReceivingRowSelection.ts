'use client';

/** Row selection for the receiving-lines table — the RECORD plane (open the row via `receiving-select-line`) and the MULTI-SELECT plane… */

import { useCallback, useEffect, useRef, useState } from 'react';
import { emitSelection, emitSelectionTotal, onToggleAll } from '@/lib/selection/table-selection';
import { dataTableSelectableIds } from '@/lib/tables/data-table-visible-rows';
import {
  dispatchSelectLine,
  RECEIVING_SELECTION_SCOPE,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

interface UseReceivingRowSelectionArgs {
  selectMode: boolean;
  /** Split the two planes: */
  rowClickOpens?: boolean;
  /** What "open this record" MEANS on this surface. */
  openRow?: (row: ReceivingLineRow) => void;
  /** Whether opening from THIS table stamps the operator's recents (the Recent tab's feed). */
  recordViewOnOpen?: boolean;
  /** Which selection bus this table broadcasts on (`src/lib/selection/table-selection.ts`). */
  selectionScope?: string;
  localRows: ReceivingLineRow[];
  orderedVisibleRows: ReceivingLineRow[];
}

interface ReceivingRowSelection {
  selectedId: number | null;
  setSelectedId: React.Dispatch<React.SetStateAction<number | null>>;
  selectedIds: Set<number>;
  /** Row-body click / keyboard nav. Opens the record when `rowClickOpens`. */
  handleSelectRow: (row: ReceivingLineRow) => void;
  /** Select-gutter click — bulk membership only, never opens. */
  handleToggleRow: (row: ReceivingLineRow) => void;
  /** Bulk-toggle every id in a PO fold (select-all / clear-group). */
  handleSelectGroup: (ids: readonly number[]) => void;
  selectedIdRef: React.MutableRefObject<number | null>;
  selectModeRef: React.MutableRefObject<boolean>;
}

export function useReceivingRowSelection({
  selectMode,
  rowClickOpens = false,
  openRow,
  recordViewOnOpen = true,
  selectionScope = RECEIVING_SELECTION_SCOPE,
  localRows,
  orderedVisibleRows,
}: UseReceivingRowSelectionArgs): ReceivingRowSelection {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Multi-select (bulk) state — only meaningful when `selectMode` is on. The
  // resolved rows are broadcast on RECEIVING_SELECTION_SCOPE for the bar.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  // The selected row left the table's dataset — deleted, filtered out, or REPLACED by its real line after an unfound carton graduated to a…
  useEffect(() => {
    if (!selectedId) return;
    if (!localRows.some((row) => row.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, localRows]);

  useEffect(() => {
    const handler = () => setSelectedId(null);
    window.addEventListener('receiving-clear-line', handler);
    return () => window.removeEventListener('receiving-clear-line', handler);
  }, []);

  // External highlight — the sidebar's up/down arrows fire this to move the
  // selected-row indicator without full row-click semantics (which would wipe
  // sidebar state). detail is the receiving_line id or null to clear.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<number | null>).detail;
      setSelectedId(typeof detail === 'number' ? detail : null);
    };
    window.addEventListener('receiving-highlight-line', handler);
    return () => window.removeEventListener('receiving-highlight-line', handler);
  }, []);

  // Track whichever row is mounted in the workspace overlay so prev/next has a
  // reference point even when the workspace was opened via
  // dispatchReceivingWorkspaceOpen (Edit PO, etc.) rather than a row click.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ row?: { id?: number } } | null>).detail;
      const id = Number(detail?.row?.id);
      if (Number.isFinite(id) && id > 0) {
        setSelectedId(id);
      }
    };
    window.addEventListener('receiving-workspace-open', handler);
    return () => window.removeEventListener('receiving-workspace-open', handler);
  }, []);

  // Track selectedId in a ref so the click handler reads the current value
  // without a stale closure — the dispatch must happen OUTSIDE the setState
  // updater (updaters must be pure).
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Read selectMode without re-creating the handler / re-subscribing listeners.
  const selectModeRef = useRef(selectMode);
  useEffect(() => { selectModeRef.current = selectMode; }, [selectMode]);

  const rowClickOpensRef = useRef(rowClickOpens);
  useEffect(() => { rowClickOpensRef.current = rowClickOpens; }, [rowClickOpens]);

  /** Bulk membership only — the select gutter's job. Never opens a record. */
  const handleToggleRow = useCallback((row: ReceivingLineRow) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }, []);

  const openRowRef = useRef(openRow);
  useEffect(() => { openRowRef.current = openRow; }, [openRow]);

  const recordViewOnOpenRef = useRef(recordViewOnOpen);
  useEffect(() => { recordViewOnOpenRef.current = recordViewOnOpen; }, [recordViewOnOpen]);

  /** Open the record — single-select; re-clicking the open row closes it. */
  const handleOpenRow = useCallback((row: ReceivingLineRow) => {
    const override = openRowRef.current;
    if (override) {
      // A navigating surface (History → `/carton/[id]`) has nothing to toggle
      // shut: every activate goes somewhere, so it marks the row and leaves.
      setSelectedId(row.id);
      override(row);
      return;
    }
    const next = selectedIdRef.current === row.id ? null : row.id;
    setSelectedId(next);
    dispatchSelectLine(next ? row : null, { recordView: recordViewOnOpenRef.current });
  }, []);

  const handleSelectRow = useCallback(
    (row: ReceivingLineRow) => {
      // Two planes, one row. When the surface splits them (`rowClickOpens`) the
      // body always opens and the gutter owns membership; otherwise keep the
      // historical "selectMode swallows the click" behaviour.
      if (selectModeRef.current && !rowClickOpensRef.current) {
        handleToggleRow(row);
        return;
      }
      handleOpenRow(row);
    },
    [handleToggleRow, handleOpenRow],
  );

  const handleSelectGroup = useCallback((ids: readonly number[]) => {
    if (!selectModeRef.current || ids.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }, []);

  // ── Bulk selection wiring ──────────────────────────────────────────────────
  // Broadcast the resolved selected rows whenever the id set or rows change.
  useEffect(() => {
    if (!selectMode) return;
    const byId = new Map(localRows.map((r) => [r.id, r]));
    const rows: ReceivingLineRow[] = [];
    for (const id of selectedIds) {
      const row = byId.get(id);
      if (row) rows.push(row);
    }
    emitSelection(selectionScope, rows);
  }, [selectMode, selectedIds, localRows, selectionScope]);

  // Leaving select mode clears the selection (and notifies listeners).
  useEffect(() => {
    if (selectMode) return;
    setSelectedIds((prev) => (prev.size ? new Set() : prev));
    emitSelection(selectionScope, []);
  }, [selectMode, selectionScope]);

  useEffect(() => {
    return onToggleAll(selectionScope, (toggle) => {
      const ids = dataTableSelectableIds(
        selectionScope,
        orderedVisibleRows.map((r) => r.id),
      );
      setSelectedIds(toggle === 'all' ? new Set(ids) : new Set());
    });
  }, [orderedVisibleRows, selectionScope]);

  useEffect(() => {
    emitSelectionTotal(
      selectionScope,
      selectMode
        ? dataTableSelectableIds(
            selectionScope,
            orderedVisibleRows.map((r) => r.id),
          ).length
        : 0,
    );
  }, [selectMode, orderedVisibleRows, selectionScope]);

  return {
    selectedId,
    setSelectedId,
    selectedIds,
    handleSelectRow,
    handleToggleRow,
    handleSelectGroup,
    selectedIdRef,
    selectModeRef,
  };
}
