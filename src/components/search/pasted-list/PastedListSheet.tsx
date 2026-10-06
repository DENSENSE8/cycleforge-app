'use client';

/**
 * THE sheet of located records — one component, three sources (owner
 * 2026-10-04/05): the pasted list full screen (`/search/list`, the locate
 * answer for `?refs=`), Receiving › Purchasing (`/purchasing`, the purchases
 * query) and Fulfilled (`/fulfilled`, the fulfilled query — its own column set,
 * a grain toggle in `tools`). All hand it `LocatedRecords` — the same entries,
 * buckets and status filter — so the status chips, click-to-copy, record
 * opening and the keys are one implementation.
 *
 * Layout (a Google-Sheets feel): the status chips lead the row directly over
 * the header, left; Copy shown · Export · Recheck all · Full screen · zoom sit right. The
 * host's Find text (its sidebar NavFind) narrows the rows over every fact
 * shown; Sort is the host sidebar's. The sheet scrolls both ways under a
 * sticky header with # · Number frozen; columns resize / fit (double-click
 * the edge) / freeze from their header and persist (`useSheetColumns`);
 * Export writes exactly the columns and rows on screen, in screen order.
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
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';
import { BULK_LIST_DEFAULT_SORT, useBulkListView, type BulkListSort } from '@/components/sidebar/contextual/bulk-list-view';
import { nextStatusSort } from '@/components/sidebar/contextual/NavBulkChips';
import { PastedListStatusRow } from '@/components/sidebar/contextual/PastedListStatusRow';
import {
  PASTED_LIST_COLUMN_SET,
  PASTED_LIST_SORT_BY,
  PASTED_LIST_TABLE_BINDING,
  pastedListCellText,
  type PastedListColumn,
  type PastedListColumnKey,
  type PastedListColumnSet,
  type PastedListRow,
} from './pasted-list-table';
import { PastedListGridRow, type RowRangeSlice } from './PastedListGridRow';
import { useCellRangeSelection, type CellRange } from '@/design-system/components/grid/useCellRangeSelection';

/** Sheets density on the header too: 4px side pad (zoom-scaled), no row inset (column hairlines: `data-grid-col-rules`). */
export const SHEET_HEADER = cn(
  '[--cf-queue-row-px:0px]',
  '[&_[role=columnheader]]:px-[calc(0.25rem*var(--cf-density,1))] [&_[role=columnheader]]:py-0',
);

/** The first paint's cascade runs this long; rows that mount later (scrolled in, filtered in) arrive as they are. */
const CASCADE_WINDOW_MS = 900;

/** Shift+arrow → how the range's focus corner moves (rows, columns). */
const ARROW_STEP: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

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

/** A row's identity — the entry's own key when its `ref` can repeat (Fulfilled's line grain), else the ref. */
const rowKey = (row: PastedListRow): string => row.view.entry.key ?? row.view.entry.ref;

export interface PastedListSheetProps {
  list: LocatedRecords;
  /** The host's Find text (its sidebar NavFind). */
  query: string;
  /**
   * The client-side order (`BulkListSort`) and its setter — the pasted list's
   * sidebar Sort and its S key / header clicks. Absent = the source's own
   * order (a query sorted server-side): no S key, no sortable headers.
   */
  sorting?: { sort: BulkListSort; onSort: (next: BulkListSort) => void };
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
  /** Esc leaves the sheet (the full list page's Back); absent = Esc is not the sheet's. */
  onEscape?: () => void;
  /** The columns this sheet can paint and mounts; default the pasted list's (`PASTED_LIST_COLUMN_SET`). Keep it stable (memoized). */
  columns?: PastedListColumnSet;
  /** First on the tool row, before the status chips — a Back for a sheet entered from another page. */
  lead?: ReactNode;
  /** The host's tools and layout toggles (not filters), on the tool row after Recheck all, before zoom and full screen. Icon-first. */
  tools?: ReactNode;
}

export function PastedListSheet({
  list,
  query,
  sorting,
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
}: PastedListSheetProps) {
  const sort = sorting?.sort ?? BULK_LIST_DEFAULT_SORT;
  // Find runs here, over every fact the sheet paints, not in the view.
  const view = useBulkListView({ list, sort, onLeave: () => undefined });
  // Columns follow the facts the WHOLE list carries; the staffer's widths / freeze ride on top.
  const allRows = useMemo(
    () => view.rows.map((rowView): PastedListRow => ({ view: rowView, repeats: list.repeats.get(rowView.entry.ref) })),
    [view.rows, list.repeats],
  );
  const mounted = useMemo(() => columns.mount(allRows), [columns, allRows]);
  const sheet = useSheetColumns(layoutKey, mounted);
  const [cursor, setCursor] = useState(0);
  const [cascade, setCascade] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setCascade(false), CASCADE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      view.visible
        .map((rowView): PastedListRow => ({ view: rowView, repeats: list.repeats.get(rowView.entry.ref) }))
        .filter((row) => matchesFacts(row, needle, columns.all)),
    [view.visible, list.repeats, needle, columns],
  );
  const groups = useMemo<[string, RowGroup<PastedListRow>[]][]>(
    () => [['', rows.map((row) => ({ key: rowKey(row), rows: [row] }))]],
    [rows],
  );
  const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));
  const indexOf = useMemo(() => new Map(rows.map((row, index) => [row, index])), [rows]);
  // What is on screen after the chips AND the find.
  const copyShown = useCallback(async () => {
    if (await copyToClipboard(rows.map((row) => row.view.entry.ref).join('\n'))) {
      toast.success(`Copied ${rows.length} ${rows.length === 1 ? noun.one : noun.many}`);
    }
  }, [rows, noun]);
  // Export: exactly the columns on screen (the staffer's order) and the rows on screen (chips + find + sort).
  const exportShown = useCallback(() => {
    const shown = sheet.columns;
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
      if (!text) return;
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

  // Keys: ↑↓ / J K walk · ↵ / O open · R recheck · ⌘C copy (the range, else the row's number) · ⌘⌥C copy shown ·
  // Shift+arrows extend the range · S sort (client order) · Esc clears the range, then the host's Esc.
  // ⌘+ / ⌘− stay the browser's zoom — the sheet's zoom is its own dropdown.
  const keys = useRef({ rows, safeCursor, openRow, view, sorting, copyShown, onEscape, cells, copyRange });
  keys.current = { rows, safeCursor, openRow, view, sorting, copyShown, onEscape, cells, copyRange };
  const keyRows = useMemo(
    () => [
      { keys: ['↑', '↓'], label: 'Move' },
      { keys: ['↵'], label: 'Open its record' },
      { keys: ['O'], label: 'Open its record' },
      { keys: ['R'], label: 'Recheck' },
      { keys: ['mod', 'C'], label: 'Copy the selected cells (else the number)' },
      { keys: ['shift', '←', '→', '↑', '↓'], label: 'Extend the cell selection' },
      { keys: ['mod', 'alt', 'C'], label: 'Copy shown' },
      ...(sorting ? [{ keys: ['S'], label: 'Sort by status' }] : []),
      ...(onEscape ? [{ keys: ['Esc'], label: 'Back' }] : []),
    ],
    [sorting, onEscape],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasOpenOverlay()) return;
      const k = keys.current;
      const row = k.rows[k.safeCursor];
      if (isEditableKeyTarget(event.target)) return;
      if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) void k.copyShown();
      else if (hotkeyFires(COPY_HOTKEY, event)) {
        if (k.cells.range) void k.copyRange(k.cells.range);
        else if (row) k.view.copyOne(row.view.entry);
        else return;
      } else if (event.metaKey || event.ctrlKey || event.altKey) return;
      else if (event.shiftKey && event.key.startsWith('Arrow')) {
        const step = ARROW_STEP[event.key];
        if (!step) return;
        k.cells.extend(step[0], step[1], { row: k.safeCursor, col: 1 });
      } else if (event.key === 'ArrowDown' || event.key === 'j') setCursor(Math.min(k.rows.length - 1, k.safeCursor + 1));
      else if (event.key === 'ArrowUp' || event.key === 'k') setCursor(Math.max(0, k.safeCursor - 1));
      else if ((event.key === 'Enter' || event.key === 'o' || event.key === 'O') && row) k.openRow(row);
      else if ((event.key === 'r' || event.key === 'R') && row) k.view.recheck(row.view.entry);
      else if ((event.key === 's' || event.key === 'S') && k.sorting) k.sorting.onSort(nextStatusSort(k.sorting.sort));
      // The first Esc drops the cell range; only then does Esc reach the host (Back) or full screen.
      else if (event.key === 'Escape' && k.cells.range) k.cells.clear();
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

  const sortKey = sorting
    ? ((Object.entries(PASTED_LIST_SORT_BY).find(([, by]) => by === sort.by)?.[0] ?? null) as PastedListColumnKey | null)
    : null;
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
          sidebar), the tools right, icon first with their words on hover: Copy shown · Export · Recheck
          all · the host's tools · zoom · full screen last, top-right. Sort is the host sidebar's. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline px-2 py-1">
        {lead}
        <PastedListStatusRow list={list} className="min-w-0 flex-1" />
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
          binding={PASTED_LIST_TABLE_BINDING}
          columns={sheet.columns}
          onResizeColumn={sheet.onResizeColumn}
          onFreezeColumn={sheet.onFreezeColumn}
          className={SHEET_HEADER}
          hideToolbar
          unpaged
          rowNoun={noun}
          rows={rows}
          orderGroupsByDate={groups}
          scrollRef={scrollRef}
          getRowId={rowKey}
          loading={list.loading && list.entries.every((e) => e.pending)}
          emptyMessage={needle && empty.found ? empty.found(query.trim()) : empty.none}
          // A source sorted server-side (no `sorting`) has no sortable headers.
          isSortable={sorting ? undefined : () => false}
          sort={sortKey}
          dir={sort.dir}
          onSortChange={(key, dir) => {
            const by = PASTED_LIST_SORT_BY[key];
            if (by && sorting) sorting.onSort({ by, dir });
          }}
          ariaLabel={ariaLabel}
          renderGroup={(group, _stripe, { columns }) => <>{group.rows.map((row) => renderRow(row, columns))}</>}
          renderRow={(row, _stripe, { columns }) => renderRow(row, columns)}
        />
      </div>
    </div>
  );

  function renderRow(row: PastedListRow, columns: readonly PastedListColumn[]) {
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
    return (
      <PastedListGridRow
        key={rowKey(row)}
        row={row}
        index={index}
        columns={columns}
        lit={index === safeCursor}
        cascade={cascade}
        range={slice}
        flash={flash?.row === index ? flash : null}
        onPoint={() => setCursor(index)}
        onOpen={() => openRow(row)}
      />
    );
  }
}
