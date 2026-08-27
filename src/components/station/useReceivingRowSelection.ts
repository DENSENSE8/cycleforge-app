'use client';

/**
 * Row selection for the receiving-lines table — the RECORD plane (open the row
 * via `receiving-select-line`) and the MULTI-SELECT plane (bulk checkboxes).
 *
 * **The two planes have separate gestures and always coexist**
 * (`display/workbench.md` → Action planes, and the golden outbound grid:
 * `useDashboardBulkSelection` keeps the gutter always-on while a row click
 * still opens the order). A plain row click opens the record; the select-gutter
 * checkbox — a real button that stops propagation — toggles bulk membership.
 *
 * That split is load-bearing, not cosmetic. `handleSelectRow` used to early-
 * return into the bulk toggle whenever `selectMode` was on, and `selectMode` is
 * pinned ON for every table-only surface (`isTableOnlyMode`) — so on `/incoming`
 * no click ever reached `dispatchSelectLine`, `useReceivingDetailOverlays` never
 * set `incomingDetails`, and `IncomingDetailsPanel` was unreachable by any
 * gesture. History had the mirror symptom: its `receiving-select-line` handler
 * deep-links into Unbox (`useReceivingSelection`) and could never fire.
 *
 * Owns `selectedId` / `selectedIds`, both handlers, the inbound selection event
 * bridges (clear-line, highlight-line, workspace-open), the "selected row left
 * the dataset" auto-clear, and the bulk-selection broadcast wiring
 * (emitSelection / emitSelectionTotal / onToggleAll). Refs let the handlers and
 * listeners read current values without stale closures.
 *
 * **Every table that renders `ReceivingGridHost` selects through THIS hook.**
 * Testing History kept a private re-implementation until 2026-08-01, differing
 * only in the selection-bus scope (now the `selectionScope` arg) — and that copy
 * still carried the pre-split `selectMode swallows the click` early return, so
 * the Testing browse could not open a line by click at all. A second copy of a
 * contract this file has now changed twice is the thing to avoid, not the
 * parameter.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { emitSelection, emitSelectionTotal, onToggleAll } from '@/lib/selection/table-selection';
import {
  dispatchSelectLine,
  RECEIVING_SELECTION_SCOPE,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from './receiving-line-row';

interface UseReceivingRowSelectionArgs {
  selectMode: boolean;
  /**
   * Split the two planes: the ROW body opens the record and the select GUTTER
   * owns bulk membership.
   *
   * Needed because `useReceivingLineBulkSelection` pins `selectMode` ON for the
   * table-only surfaces ("selection is always on while `active`"), and the
   * original `handleSelectRow` read `selectMode` as "bulk mode — never open the
   * workspace". Always-on select therefore meant NEVER-open: on `/incoming` a
   * row click emitted no `receiving-select-line`, so `IncomingDetailsPanel`
   * could not mount at all, and the whole row acted as one big checkbox while
   * the gutter cell was inert.
   *
   * With this on, both planes coexist the way the dashboard Pending grid already
   * does them (gutter checkbox = multi-select, row body = open the record) —
   * `display/workbench.md` → Action planes, "a surface gets real selection OR a
   * collapsed gutter — never an inert one".
   */
  rowClickOpens?: boolean;
  /**
   * What "open this record" MEANS on this surface. Default: dispatch
   * `receiving-select-line`, which the receiving pane turns into the Incoming
   * inspector / the Unbox workspace.
   *
   * History overrides it. Its `receiving-select-line` branch does
   * `router.replace('/unbox?openReceivingId=…')` — so reusing the default there
   * would make a plain click on a week-of-cartons BROWSE table teleport the
   * operator into the scan bench, mixing a Workbench map with a Station
   * (`contextual-display.md` → one contract per region). The durable read record
   * is `/carton/[id]` (`cartonReadHref`), which is what History opens instead.
   */
  openRow?: (row: ReceivingLineRow) => void;
  /**
   * Whether opening from THIS table stamps the operator's recents (the Recent
   * tab's feed). Default true — the historical dispatchers all mean "I am
   * working this carton".
   *
   * Unbox passes false: its feed is a 117-row browse map, and a click there is
   * navigation. If every click counted, Recent would converge on a copy of the
   * feed and stop answering which cartons the operator actually opened.
   */
  recordViewOnOpen?: boolean;
  /**
   * Which selection bus this table broadcasts on
   * (`src/lib/selection/table-selection.ts`). Defaults to receiving.
   *
   * Testing History passes `TESTING_SELECTION_SCOPE`: it renders the same
   * `ReceivingGridHost` over the same `ReceivingLineRow`, but its bulk bar is
   * the tech dashboard's, not the receiving pane's. The scope was the ONLY
   * thing its private copy of this hook varied — every handler and every bus
   * effect below was a byte-level duplicate that then missed the two-plane
   * split when it landed here.
   */
  selectionScope?: string;
  localRows: ReceivingLineRow[];
  orderedVisibleRows: ReceivingLineRow[];
}

export interface ReceivingRowSelection {
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

  // The selected row left the table's dataset — deleted, filtered out, or
  // REPLACED by its real line after an unfound carton graduated to a PO match.
  // Clear only the table's own highlight (true deletions broadcast
  // receiving-line-deleted / -entry-deleted, handled elsewhere).
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

  // Header "Select all" / "Clear" → toggle every currently-visible row.
  useEffect(() => {
    return onToggleAll(selectionScope, (toggle) => {
      setSelectedIds(toggle === 'all' ? new Set(orderedVisibleRows.map((r) => r.id)) : new Set());
    });
  }, [orderedVisibleRows, selectionScope]);

  // Publish the selectable total so the action bar's select-all ring can fill.
  // Zero outside select mode so a stale "all selected" never lingers.
  useEffect(() => {
    emitSelectionTotal(selectionScope, selectMode ? orderedVisibleRows.length : 0);
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
