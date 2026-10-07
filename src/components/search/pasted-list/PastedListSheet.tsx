'use client';

/**
 * THE sheet of located records — one component, three sources (owner
 * 2026-10-04/05/06): Records (`/records`, the records query — a pasted list
 * is one way of filling it), Receiving › Purchasing (`/purchasing`, the
 * purchases query) and Fulfilled (`/fulfilled`, the fulfilled query — its own
 * column set, a grain toggle in `tools`). All hand it `LocatedRecords` — the
 * same entries, buckets and status filter — so click-to-copy, record opening
 * and the keys are one implementation.
 *
 * Layout (a Google-Sheets feel): the status chips lead the row directly over
 * the header, left (a source whose statuses are sidebar facets turns them off,
 * `statusRow={false}`); Copy shown · Export · Recheck all · the host's tools ·
 * zoom · full screen sit right. The host's Find text (its sidebar NavFind)
 * narrows the rows over every fact shown; Sort is the host sidebar's, and a
 * sortable header writes the same sort (`columnSort`, server-side). The sheet
 * scrolls both ways under a sticky header with the identity pane frozen left
 * (and a source's trailing pane — `frozenEnd`, Records' statuses — pinned
 * right); columns resize / fit (double-click the edge) / freeze from their header and persist (`useSheetColumns`);
 * Export writes exactly the columns and rows on screen, in screen order.
 *
 * Opt-in (Records, operator 2026-10-06): `selection` — a `select` column of
 * checks, Shift-click ranges, ⌘A, `x` on the cursor row, Esc clears (Linear);
 * `groupBy` — a condensed grain folds lines under one head with a count,
 * opened in place; `edit` — identifier cells edit in place on the house
 * inline editor.
 *
 * Display method: the canonical DataTable (ds_display_method → data-table,
 * HIGH, hundreds of rows × 10 compared facts at a desk).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { SHEET_ZOOM_STEPS, useSheetColumns } from '@/components/tables/useSheetColumns';
import { ZoomMenu } from '@/components/tables/DataTableZoomToggle';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Copy, Download, RefreshCw } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { ListFocusToggle } from '@/design-system/components/ListFocusToggle';
import type { LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import { downloadExport } from '@/lib/tables/export/download';
import type { DataTableRowNoun } from '@/lib/tables/data-table-pagination';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { emitSelection, onToggleAll } from '@/lib/selection/table-selection';
import { clearSelection, extendTo, selectAll, toggleAt, type SelectionAnchorResult, type SelectionAnchorState } from '@/lib/selection/selection-anchor';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';
import { BULK_LIST_DEFAULT_SORT, useBulkListView } from '@/components/sidebar/contextual/bulk-list-view';
import { PastedListStatusRow } from '@/components/sidebar/contextual/PastedListStatusRow';
import {
  PASTED_LIST_TABLE_BINDING,
  makePastedListDescriptor,
  pastedListCellText,
  type PastedListColumn,
  type PastedListColumnKey,
  PASTED_LIST_COLUMN_SET,
  type PastedListColumnSet,
  type PastedListRow,
} from './pasted-list-table';
import { PastedListGridRow, type RowCellEdit, type RowRangeSlice } from './PastedListGridRow';
import { useCellRangeSelection, type CellRange } from '@/design-system/components/grid/useCellRangeSelection';

/** Sheets density on the header too: 4px side pad (zoom-scaled), no row inset (column hairlines: `data-grid-col-rules`). */
export const SHEET_HEADER = cn(
  '[--cf-queue-row-px:0px]',
  '[&_[role=columnheader]]:px-[calc(0.25rem*var(--cf-density,1))] [&_[role=columnheader]]:py-0',
);

/** Shift+arrow → how the range's focus corner moves (rows, columns). */
const ARROW_STEP: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

const NO_KEYS: ReadonlySet<string> = new Set();
const NO_EDIT: readonly PastedListColumnKey[] = [];

/** Find: every column's text the sheet knows, plus what a row carries without a column (title, facet). */
function matchesFacts(row: PastedListRow, needle: string, columns: readonly PastedListColumn[]): boolean {
  if (!needle) return true;
  const hay = [
    ...columns.map((column) => pastedListCellText(row, column.key)),
    row.view.entry.title,
    row.view.entry.facet?.label,
  ];
  return hay.some((value) => value?.toLowerCase().includes(needle));
}

/** A record's identity — the entry's own key when its `ref` can repeat (a line grain), else the ref. */
const entryKey = (row: PastedListRow): string => row.view.entry.key ?? row.view.entry.ref;

/** A painted row's identity: a head by its group, a member under it by its line, else the record. */
function displayKey(row: PastedListRow): string {
  if (row.group) return `g:${row.group.key}`;
  return row.member ? `m:${entryKey(row)}` : entryKey(row);
}

export interface PastedListSheetProps {
  list: LocatedRecords;
  /** The host's Find text (its sidebar NavFind); '' when Find is the query's own (server-side). */
  query: string;
  /**
   * A source sorted server-side: which headers sort (key → the direction its
   * first press asks for), the column the query sorts by, and the press — the
   * host writes it to its URL and the query answers in that order. Absent =
   * no sortable headers. Keep `sortable` stable (a module constant).
   */
  columnSort?: {
    sortable: Readonly<Partial<Record<PastedListColumnKey, 'asc' | 'desc'>>>;
    key: PastedListColumnKey | null;
    dir: 'asc' | 'desc';
    onSort: (key: PastedListColumnKey, dir: 'asc' | 'desc') => void;
  };
  /** What a record is called — the footer, the copy toast. */
  noun: DataTableRowNoun;
  /** Where the staffer's column layout + zoom persist (`useSheetColumns`). */
  layoutKey: string;
  /** The CSV's file name (no extension). */
  exportName: string;
  ariaLabel: string;
  /** The empty sheet's words: with nothing at all, and (a client-side Find) with no match. */
  empty: { none: string; found?: (query: string) => string };
  /** The `?` sheet group this sheet's keys register under. */
  keysGroup: { id: string; title: string };
  /** Esc leaves the sheet (a Back); absent = Esc is not the sheet's. */
  onEscape?: () => void;
  /** The columns this sheet can paint and mounts; default the pasted list's (`PASTED_LIST_COLUMN_SET`). Keep it stable (a module constant or memoized). */
  columns?: PastedListColumnSet;
  /** First on the tool row, before the status chips — a Back for a sheet entered from another page. */
  lead?: ReactNode;
  /** The host's tools and layout toggles (not filters), on the tool row after Recheck all, before zoom and full screen. Icon-first. */
  tools?: ReactNode;
  /**
   * A press on an EMPTY cell (nothing to copy) — the host may offer to fill
   * it (Purchasing: add the missing tracking number). Absent = an empty cell
   * does nothing.
   */
  onEmptyCell?: (row: PastedListRow, key: PastedListColumnKey) => void;
  /** The status chip row over the header (default on). Off for a source whose statuses are sidebar facets. */
  statusRow?: boolean;
  /** Records the source matched before its row cap — the footer's "shown of total". */
  total?: number;
  /**
   * The check-set, at the grain shown: a line's key, or a condensed grain's
   * group key (`groupBy`). Needs a `select` column. `scope` is the table
   * selection bus the header's select-all reads.
   */
  selection?: {
    scope: string;
    keys: ReadonlySet<string>;
    onChange: (next: ReadonlySet<string>) => void;
  };
  /**
   * A condensed grain: rows sharing a key fold under one head (its first
   * line's facts, a line count, opened in place); null = a row of its own.
   * Keep it stable per grain.
   */
  groupBy?: (row: PastedListRow) => string | null;
  /** In-place identifier edit: the cells a painted row may edit (a stable list), and the commit. */
  edit?: {
    keysFor: (row: PastedListRow) => readonly PastedListColumnKey[];
    commit: (row: PastedListRow, key: PastedListColumnKey, value: string) => void;
  };
}

export function PastedListSheet({
  list,
  query,
  columnSort,
  noun,
  layoutKey,
  exportName,
  ariaLabel,
  empty,
  keysGroup,
  onEscape,
  columns = PASTED_LIST_COLUMN_SET,
  lead,
  tools,
  onEmptyCell,
  statusRow = true,
  total,
  selection,
  groupBy,
  edit,
}: PastedListSheetProps) {
  // Find runs here, over every fact the sheet paints, not in the view; the source's own order is kept.
  const view = useBulkListView({ list, sort: BULK_LIST_DEFAULT_SORT, onLeave: () => undefined });
  // Columns follow the facts the WHOLE list carries; the staffer's widths / freeze ride on top.
  const allRows = useMemo(
    () => view.rows.map((rowView): PastedListRow => ({ view: rowView, repeats: list.repeats.get(rowView.entry.ref) })),
    [view.rows, list.repeats],
  );
  const mounted = useMemo(() => columns.mount(allRows), [columns, allRows]);
  const sheet = useSheetColumns(layoutKey, mounted);
  const [cursor, setCursor] = useState(0);

  const needle = query.trim().toLowerCase();
  const lines = useMemo(
    () =>
      view.visible
        .map((rowView): PastedListRow => ({ view: rowView, repeats: list.repeats.get(rowView.entry.ref) }))
        .filter((row) => matchesFacts(row, needle, columns.all)),
    [view.visible, list.repeats, needle, columns],
  );

  // ── Grain: heads fold their lines; an open head shows them beneath it. Open heads reset with the grain. ──
  const [opened, setOpened] = useState<{ groupBy: typeof groupBy; keys: ReadonlySet<string> }>({ groupBy, keys: NO_KEYS });
  const openKeys = opened.groupBy === groupBy ? opened.keys : NO_KEYS;
  const toggleOpen = useCallback(
    (key: string) =>
      setOpened((current) => {
        const keys = new Set(current.groupBy === groupBy ? current.keys : NO_KEYS);
        if (keys.has(key)) keys.delete(key);
        else keys.add(key);
        return { groupBy, keys };
      }),
    [groupBy],
  );
  /** Painted groups (one RowGroup per head or line), the flat painted rows, and each painted row's selection unit. */
  const painted = useMemo(() => {
    const groups: RowGroup<PastedListRow>[] = [];
    if (!groupBy) {
      for (const row of lines) groups.push({ key: entryKey(row), rows: [row] });
    } else {
      const byKey = new Map<string, PastedListRow[]>();
      const order: (string | PastedListRow)[] = [];
      for (const row of lines) {
        const key = groupBy(row);
        if (key == null) {
          order.push(row);
          continue;
        }
        const bucket = byKey.get(key);
        if (bucket) bucket.push(row);
        else {
          byKey.set(key, [row]);
          order.push(key);
        }
      }
      for (const item of order) {
        if (typeof item !== 'string') {
          groups.push({ key: entryKey(item), rows: [item] });
          continue;
        }
        const members = byKey.get(item)!;
        const open = openKeys.has(item);
        const head: PastedListRow = { ...members[0]!, group: { key: item, lines: members, open } };
        groups.push({ key: item, rows: open ? [head, ...members.map((row) => ({ ...row, member: true }))] : [head] });
      }
    }
    const rows = groups.flatMap((group) => group.rows);
    // The unit a painted row selects: a head its group, a line itself, a member its head's group.
    const unitAt = groups.flatMap((group) => group.rows.map(() => group.key));
    const units = groups.map((group) => group.key);
    return { bands: [['', groups]] as [string, RowGroup<PastedListRow>[]][], rows, unitAt, units };
  }, [lines, groupBy, openKeys]);
  const rows = painted.rows;

  const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));
  const indexOf = useMemo(() => new Map(rows.map((row, index) => [row, index])), [rows]);

  // ── The check-set (Linear): anchor-resolved toggles and ranges over the units in display order. ──
  const selected = selection?.keys ?? NO_KEYS;
  const anchorRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const unitsRef = useRef(painted.units);
  unitsRef.current = painted.units;
  const applySelection = useCallback((run: (state: SelectionAnchorState<string>) => SelectionAnchorResult<string>) => {
    const current = selectionRef.current;
    if (!current) return;
    const result = run({ ids: unitsRef.current, selected: current.keys, anchorId: anchorRef.current });
    anchorRef.current = result.anchorId;
    if (result.changed) current.onChange(result.selected);
  }, []);
  // A unit that left the list (a filter, a refetch) leaves the check-set.
  useEffect(() => {
    if (!selection || selection.keys.size === 0) return;
    const live = new Set(painted.units);
    const kept = [...selection.keys].filter((key) => live.has(key));
    if (kept.length !== selection.keys.size) selection.onChange(new Set(kept));
  }, [painted.units, selection]);
  // The header's select-all reads the bus: one entry per painted row the check-set covers (a head and its open lines).
  const scope = selection?.scope ?? null;
  useEffect(() => {
    if (!scope) return;
    let id = 0;
    const covered: { id: number }[] = [];
    painted.unitAt.forEach((unit) => {
      if (selected.has(unit)) covered.push({ id: (id += 1) });
    });
    emitSelection(scope, covered);
  }, [scope, selected, painted.unitAt]);
  useEffect(() => {
    if (!scope) return;
    return onToggleAll(scope, (mode) => applySelection((state) => (mode === 'all' ? selectAll(state) : clearSelection(state))));
  }, [scope, applySelection]);

  // What is on screen after the chips AND the find.
  const copyShown = useCallback(async () => {
    if (await copyToClipboard(rows.map((row) => row.view.entry.ref).join('\n'))) {
      toast.success(`Copied ${rows.length} ${rows.length === 1 ? noun.one : noun.many}`);
    }
  }, [rows, noun]);
  // Export: exactly the columns on screen (the staffer's order) and the rows on screen (chips + find + sort).
  const exportShown = useCallback(() => {
    const shown = sheet.columns.filter((column) => column.key !== 'select');
    downloadExport(
      shown.map((column) => column.gridLabel ?? column.label ?? column.key),
      rows.map((row) => shown.map((column) => pastedListCellText(row, column.key))),
      exportName,
      'csv',
    );
    toast.success(`Exported ${rows.length} rows`);
  }, [rows, sheet.columns, exportName]);
  // A press on a cell copies it (owner 2026-10-04): the house clipboard + a toast naming the value.
  // A drag (or Shift+press) selects a cell RANGE and copies it as TSV — exactly the painted text.
  const hostRef = useRef<HTMLDivElement>(null);
  const colKeys = useMemo(() => sheet.columns.map((column) => column.key), [sheet.columns]);
  const [flash, setFlash] = useState<{ row: number; col: PastedListColumnKey; n: number } | null>(null);
  const copyRange = useCallback(
    async (range: CellRange) => {
      const cols = sheet.columns.slice(range.c0, range.c1 + 1);
      const tsv = rows
        .slice(range.r0, range.r1 + 1)
        .map((row) => cols.map((column) => pastedListCellText(row, column.key)).join('\t'))
        .join('\n');
      const n = (range.r1 - range.r0 + 1) * cols.length;
      if (await copyToClipboard(tsv)) toast.success(`Copied ${n} ${n === 1 ? 'cell' : 'cells'}`);
    },
    [rows, sheet.columns],
  );
  const cells = useCellRangeSelection({
    hostRef,
    colKeys,
    rowCount: rows.length,
    onCommit: (range) => void copyRange(range),
    onCell: (cell) => {
      const row = rows[cell.row];
      const key = colKeys[cell.col];
      if (!row || !key) return;
      setCursor(cell.row);
      const text = pastedListCellText(row, key);
      if (!text) {
        onEmptyCell?.(row, key);
        return;
      }
      setFlash((last) => ({ row: cell.row, col: key, n: (last?.n ?? 0) + 1 }));
      void copyToClipboard(text).then((ok) => ok && toast.success(`Copied ${text}`));
    },
  });
  // A row opens its record the way its triage card does (`recordDetailsNavigation`, via the view);
  // with none, the list that holds it, narrowed to it. The sheet's scroll is kept for the way back.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${layoutKey}:scroll`;
  const openRow = useCallback(
    (row: PastedListRow) => {
      const { entry, buckets } = row.view;
      const top = scrollRef.current?.scrollTop ?? 0;
      window.sessionStorage.setItem(scrollKey, JSON.stringify({ at: window.location.search, top }));
      if (entry.recordHref) view.openRecord(entry);
      else {
        const home = buckets.find((b) => b.bucket.href);
        if (home) view.openBucket(home.bucket, entry);
      }
    },
    [view, scrollKey],
  );
  // Back from a record (`recordBack`): the same list, scrolled where it was left.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || rows.length === 0 || !scrollRef.current) return;
    restored.current = true;
    const saved = window.sessionStorage.getItem(scrollKey);
    if (!saved) return;
    window.sessionStorage.removeItem(scrollKey);
    const { at, top } = JSON.parse(saved) as { at: string; top: number };
    if (at === window.location.search) scrollRef.current.scrollTop = top;
  }, [rows.length, scrollKey]);

  // ── In-place edit: one cell at a time, keyed by its painted row. ──
  const [editing, setEditing] = useState<{ row: string; key: PastedListColumnKey } | null>(null);

  // Keys: ↑↓ / J K walk · ↵ / O open · R recheck · ⌘C copy (the range, else the row's number) · ⌘⌥C copy shown ·
  // Shift+arrows extend the range · with a check-set: X toggles the cursor row, ⌘A checks every row ·
  // Esc clears the range, then the check-set, then the host's Esc.
  // ⌘+ / ⌘− stay the browser's zoom — the sheet's zoom is its own dropdown.
  const keys = useRef({ rows, safeCursor, openRow, view, copyShown, onEscape, cells, copyRange, painted, selected, applySelection });
  keys.current = { rows, safeCursor, openRow, view, copyShown, onEscape, cells, copyRange, painted, selected, applySelection };
  const selecting = selection != null;
  const keyRows = useMemo(
    () => [
      { keys: ['↑', '↓'], label: 'Move' },
      { keys: ['J', 'K'], label: 'Move' },
      { keys: ['↵'], label: 'Open its record' },
      { keys: ['O'], label: 'Open its record' },
      { keys: ['R'], label: 'Recheck' },
      { keys: ['mod', 'C'], label: 'Copy the selected cells (else the number)' },
      { keys: ['shift', '←', '→', '↑', '↓'], label: 'Extend the cell selection' },
      { keys: ['mod', 'alt', 'C'], label: 'Copy shown' },
      ...(selecting
        ? [
            { keys: ['X'], label: 'Select the row' },
            { keys: ['shift', 'click'], label: 'Select a range of rows' },
            { keys: ['mod', 'A'], label: 'Select every row' },
            { keys: ['Esc'], label: 'Clear the selection' },
          ]
        : []),
      ...(onEscape ? [{ keys: ['Esc'], label: 'Back' }] : []),
    ],
    [selecting, onEscape],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasOpenOverlay()) return;
      const k = keys.current;
      const row = k.rows[k.safeCursor];
      if (isEditableKeyTarget(event.target)) return;
      const checking = selectionRef.current != null;
      if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) void k.copyShown();
      else if (hotkeyFires(COPY_HOTKEY, event)) {
        if (k.cells.range) void k.copyRange(k.cells.range);
        else if (row) k.view.copyOne(row.view.entry);
        else return;
      } else if (checking && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a') {
        k.applySelection((state) => selectAll(state));
      } else if (event.metaKey || event.ctrlKey || event.altKey) return;
      else if (event.shiftKey && event.key.startsWith('Arrow')) {
        const step = ARROW_STEP[event.key];
        if (!step) return;
        k.cells.extend(step[0], step[1], { row: k.safeCursor, col: 1 });
      } else if (event.key === 'ArrowDown' || event.key === 'j') setCursor(Math.min(k.rows.length - 1, k.safeCursor + 1));
      else if (event.key === 'ArrowUp' || event.key === 'k') setCursor(Math.max(0, k.safeCursor - 1));
      else if ((event.key === 'Enter' || event.key === 'o' || event.key === 'O') && row) k.openRow(row);
      else if ((event.key === 'r' || event.key === 'R') && row) k.view.recheck(row.view.entry);
      else if ((event.key === 'x' || event.key === 'X') && checking && row) {
        const unit = k.painted.unitAt[k.safeCursor];
        if (!unit) return;
        k.applySelection((state) => toggleAt(state, unit));
      }
      // The first Esc drops the cell range, the next the check-set; only then does Esc reach the host (Back) or full screen.
      else if (event.key === 'Escape' && k.cells.range) k.cells.clear();
      else if (event.key === 'Escape' && checking && k.selected.size > 0) k.applySelection((state) => clearSelection(state));
      else if (event.key === 'Escape' && k.onEscape) k.onEscape();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    const unregister = registerShortcutOverviewGroup({ ...keysGroup, rows: keyRows });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, [keysGroup, keyRows]);

  const serverSortable = columnSort?.sortable;
  const capabilities = columns.capabilities;
  // A server-sorted source's headers: its own sortable keys, each with its first-press direction; its own capabilities.
  const binding = useMemo(
    () =>
      serverSortable || capabilities
        ? {
            ...PASTED_LIST_TABLE_BINDING,
            makeDescriptor: (cols: readonly PastedListColumn[]) =>
              makePastedListDescriptor(
                cols,
                serverSortable
                  ? {
                      isSortable: (key) => key in serverSortable,
                      descFirst: (key) => serverSortable[key as PastedListColumnKey] === 'desc',
                    }
                  : undefined,
                capabilities,
              ),
          }
        : PASTED_LIST_TABLE_BINDING,
    [serverSortable, capabilities],
  );
  const counts = view.counts;

  return (
    <div data-pasted-list-page className="flex min-h-0 w-full flex-1 flex-col">
      {list.error ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline px-3 py-1.5 text-role-caption text-text-danger">
          <span className="min-w-0 flex-1 truncate">{list.error}</span>
          <Button size="sm" variant="ghost" onClick={list.refetch}>
            Retry
          </Button>
        </div>
      ) : null}
      {/* ONE row directly over the sheet's header row (operator 2026-10-05): the host's Back first (when it
          has one), the statuses left on one fitting line (the sheet's one status control — never the
          sidebar; off when the statuses are sidebar facets), the tools right, icon first with their words on
          hover: Copy shown · Export · Recheck all · the host's tools · zoom · full screen last, top-right. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline px-2 py-1">
        {lead}
        {statusRow ? <PastedListStatusRow list={list} className="min-w-0 flex-1" /> : null}
        <div data-pasted-list-tools className="ml-auto flex shrink-0 items-center gap-1">
          {counts.checking > 0 ? (
            <span className="whitespace-nowrap pr-1 text-role-caption tabular-nums text-text-faint">Checking {counts.checking}</span>
          ) : null}
          <HoverTooltip label="Copy shown" shortcut="Mod + Alt + C" asChild>
            <IconButton ariaLabel="Copy shown" size="sm" onClick={() => void copyShown()} icon={<Copy aria-hidden className="size-4" />} />
          </HoverTooltip>
          <HoverTooltip label="Export" asChild>
            <IconButton
              ariaLabel="Export"
              size="sm"
              onClick={exportShown}
              disabled={rows.length === 0}
              data-pasted-list-export
              icon={<Download aria-hidden className="size-4" />}
            />
          </HoverTooltip>
          <HoverTooltip label="Recheck all" asChild>
            <IconButton
              ariaLabel="Recheck all"
              size="sm"
              onClick={list.refetch}
              disabled={list.loading}
              icon={<RefreshCw aria-hidden className="size-4" />}
            />
          </HoverTooltip>
          {tools}
          {/* The sheet's type, rows and padding together. */}
          <ZoomMenu value={sheet.zoom} steps={SHEET_ZOOM_STEPS} onChange={sheet.setZoom} testId="pasted-list-zoom" />
          <ListFocusToggle />
        </div>
      </div>
      <div
        ref={hostRef}
        data-grid-col-rules
        data-cell-dragging={cells.dragging || undefined}
        // One delegated handler for every cell (no per-cell listeners); a drag never selects text.
        onPointerDown={cells.onPointerDown}
        className={cn('flex min-h-0 flex-1 flex-col', cells.dragging && 'select-none')}
        // The sheet's zoom: role type, rem tracks and the cell padding all read `--cf-density`.
        style={{ '--cf-density': String(sheet.zoom / 100) } as CSSProperties}
      >
        <DataTable<PastedListRow, PastedListColumnKey, PastedListColumn>
          binding={binding}
          columns={sheet.columns}
          onResizeColumn={sheet.onResizeColumn}
          onFreezeColumn={sheet.onFreezeColumn}
          className={SHEET_HEADER}
          hideToolbar
          unpaged
          rowNoun={noun}
          rows={rows}
          totalCount={total}
          orderGroupsByDate={painted.bands}
          scrollRef={scrollRef}
          getRowId={displayKey}
          selectionScope={selection?.scope}
          loading={list.loading && list.entries.every((e) => e.pending)}
          emptyMessage={needle && empty.found ? empty.found(query.trim()) : empty.none}
          isSortable={serverSortable ? (key) => key in serverSortable : () => false}
          sort={columnSort?.key ?? null}
          dir={columnSort?.dir ?? null}
          onSortChange={(key, dir) => {
            if (columnSort && key in columnSort.sortable) columnSort.onSort(key, dir);
          }}
          ariaLabel={ariaLabel}
          renderGroup={(group, _stripe, { columns }) => <>{group.rows.map((row) => renderRow(row, columns))}</>}
          renderRow={(row, _stripe, { columns }) => renderRow(row, columns)}
        />
      </div>
    </div>
  );

  function renderRow(row: PastedListRow, visible: readonly PastedListColumn[]) {
    const index = indexOf.get(row) ?? 0;
    const range = cells.range;
    const slice: RowRangeSlice | null =
      range && index >= range.r0 && index <= range.r1
        ? {
            c0: range.c0,
            c1: range.c1,
            top: index === range.r0,
            bottom: index === range.r1,
            anchorCol: range.anchor.row === index ? range.anchor.col : null,
          }
        : null;
    const key = displayKey(row);
    const unit = painted.unitAt[index];
    const editKeys = edit ? edit.keysFor(row) : NO_EDIT;
    const rowEdit: RowCellEdit | undefined =
      edit && editKeys.length > 0
        ? {
            key: editing?.row === key ? editing.key : null,
            keys: editKeys,
            start: (cell) => setEditing({ row: key, key: cell }),
            commit: (cell, value) => {
              setEditing(null);
              edit.commit(row, cell, value);
            },
            cancel: () => setEditing(null),
          }
        : undefined;
    const group = row.group;
    return (
      <PastedListGridRow
        key={key}
        row={row}
        index={index}
        columns={visible}
        lit={index === safeCursor}
        range={slice}
        flash={flash?.row === index ? flash : null}
        onPoint={() => setCursor(index)}
        onOpen={() => openRow(row)}
        checked={selection && !row.member && unit ? selected.has(unit) : undefined}
        onToggle={
          selection && unit
            ? (event) => applySelection((state) => (event.shiftKey ? extendTo(state, unit) : toggleAt(state, unit)))
            : undefined
        }
        onExpand={group && group.lines.length > 1 ? () => toggleOpen(group.key) : undefined}
        edit={rowEdit}
      />
    );
  }
}
