'use client';

/**
 * `/search/list` — the search bar's held list, FULL SCREEN (owner 2026-10-04:
 * "a full screen list display that the user can easily go into and view all
 * the information — not just a tiny top-left display").
 *
 * The list is the URL: `?refs=` (the bar's strings, same parse and cap),
 * `?locator=` (whose buckets), `?status=` (one bucket), `?back=` (where Esc
 * returns). The bucket answer is the SAME locate query the bar ran
 * (`useBulkList` → `useLocatedList`, one React Query key), so opening the
 * page asks nothing new. Every number a Receiving bucket holds — the page's
 * own, or found elsewhere — also reads the Inbound ledger's data path
 * (`useInboundCheck` + its `receivingReconcileRowsQuery` lines, paired by
 * `pastedNumbers` and read by `pastedNumberFacts`): delivered, unboxed + by
 * whom, units counted / bought, PO, vendor, item. Outbound numbers show what
 * the locate answer carries (status, order · title, detail, record link).
 *
 * Layout (owner 2026-10-04, a Google-Sheets feel): the page's find, bucket
 * facet (`?status=`) and Sort (`?sort=`) are its contextual sidebar
 * (`NAV_PAGE_DECLS.search`; Find is the desk store keyed by this path; the
 * list reads `use-url-bulk-list` — ruling A1/A4) narrowing the
 * rows over every fact shown; the sheet scrolls both ways under a sticky
 * header with # · Number frozen, columns resize / fit (double-click the edge)
 * / freeze from their header and persist (`useSheetColumns`); Export writes
 * exactly the columns and rows on screen, in screen order.
 *
 * Display method: the canonical DataTable (ds_display_method → data-table,
 * HIGH, 250 rows × 10 compared facts at a desk).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { SHEET_ZOOM_STEPS, useSheetColumns } from '@/components/tables/useSheetColumns';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Copy, Download, Minus, Plus, RefreshCw } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { SEARCH_PATHS } from '@/lib/nav/route-tree';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { downloadExport } from '@/lib/tables/export/download';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';
import { useBulkListView } from '@/components/sidebar/contextual/bulk-list-view';
import { nextStatusSort } from '@/components/sidebar/contextual/NavBulkChips';
import { useUrlBulkList, useUrlBulkListSort } from '@/components/sidebar/contextual/use-url-bulk-list';
import {
  PASTED_LIST_COLUMNS,
  PASTED_LIST_LAYOUT_KEY,
  PASTED_LIST_SORT_BY,
  PASTED_LIST_TABLE_BINDING,
  pastedListCellText,
  pastedListMountedColumns,
  type PastedListColumn,
  type PastedListColumnKey,
  type PastedListRow,
} from './pasted-list-table';
import { PastedListGridRow } from './PastedListGridRow';
import { usePastedListBack } from './PastedListBack';

/** Sheets density on the header too: 4px side pad (zoom-scaled), no row inset (column hairlines: `data-grid-col-rules`). */
const SHEET_HEADER = cn(
  '[--cf-queue-row-px:0px]',
  '[&_[role=columnheader]]:px-[calc(0.25rem*var(--cf-density,1))] [&_[role=columnheader]]:py-0',
);

/** The first paint's cascade runs this long; rows that mount later (scrolled in, filtered in) arrive as they are. */
const CASCADE_WINDOW_MS = 900;

/** Find: every column's text the sheet knows, plus what a row carries without a column (title, facet). */
function matchesFacts(row: PastedListRow, needle: string): boolean {
  if (!needle) return true;
  const hay = [
    ...PASTED_LIST_COLUMNS.map((column) => pastedListCellText(row, column.key)),
    row.view.entry.title,
    row.view.entry.facet?.label,
  ];
  return hay.some((value) => value?.toLowerCase().includes(needle));
}

export function PastedListPage() {
  const goBack = usePastedListBack();
  const list = useUrlBulkList();
  const [sort, setSort] = useUrlBulkListSort();
  // The page's ONE find is the sidebar field (`NAV_PAGE_DECLS.search`, desk store keyed by this path).
  const [query] = useDeskSearch(SEARCH_PATHS.pastedList);
  // Find runs here, over every fact the page paints, not in the view.
  const view = useBulkListView({ list, sort, onLeave: () => undefined });
  // Columns follow the facts the WHOLE list carries; the staffer's widths / freeze ride on top.
  const allRows = useMemo(
    () => view.rows.map((rowView): PastedListRow => ({ view: rowView, repeats: list.repeats.get(rowView.entry.ref) })),
    [view.rows, list.repeats],
  );
  const mounted = useMemo(() => pastedListMountedColumns(allRows), [allRows]);
  const sheet = useSheetColumns(PASTED_LIST_LAYOUT_KEY, mounted);
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
        .filter((row) => matchesFacts(row, needle)),
    [view.visible, list.repeats, needle],
  );
  const groups = useMemo<[string, RowGroup<PastedListRow>[]][]>(
    () => [['', rows.map((row) => ({ key: row.view.entry.ref, rows: [row] }))]],
    [rows],
  );
  const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));
  const indexOf = useMemo(() => new Map(rows.map((row, index) => [row, index])), [rows]);
  // What is on screen after the chips AND the find — the panel's copy reads the chips alone.
  const copyShown = useCallback(async () => {
    if (await copyToClipboard(rows.map((row) => row.view.entry.ref).join('\n'))) toast.success(`Copied ${rows.length} numbers`);
  }, [rows]);
  // Export: exactly the columns on screen (the staffer's order) and the rows on screen (chips + find + sort).
  const exportShown = useCallback(() => {
    const shown = sheet.columns;
    downloadExport(
      shown.map((column) => column.gridLabel ?? column.label ?? column.key),
      rows.map((row) => shown.map((column) => pastedListCellText(row, column.key))),
      'pasted-list',
      'csv',
    );
    toast.success(`Exported ${rows.length} rows`);
  }, [rows, sheet.columns]);
  // A press on a cell copies it (owner 2026-10-04): the house clipboard + a toast naming the value.
  const copyCell = useCallback(async (text: string) => {
    if (await copyToClipboard(text)) toast.success(`Copied ${text}`);
  }, []);
  // A row opens its record; with none, the list that holds it, narrowed to it.
  const openRow = useCallback(
    (row: PastedListRow) => {
      const { entry, buckets } = row.view;
      if (entry.recordHref) view.openRecord(entry);
      else {
        const home = buckets.find((b) => b.bucket.href);
        if (home) view.openBucket(home.bucket, entry);
      }
    },
    [view],
  );

  // Keys: ↑↓ / J K walk · ↵ / O open · R recheck · ⌘C copy · ⌘⌥C copy shown · S sort · Esc back (F is the sidebar field's).
  // ⌘+ / ⌘− stay the browser's zoom — the sheet's zoom is its own − / + buttons.
  const keys = useRef({ rows, safeCursor, openRow, goBack, view, sort, copyShown });
  keys.current = { rows, safeCursor, openRow, goBack, view, sort, copyShown };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasOpenOverlay()) return;
      const k = keys.current;
      const row = k.rows[k.safeCursor];
      if (isEditableKeyTarget(event.target)) return;
      if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) void k.copyShown();
      else if (hotkeyFires(COPY_HOTKEY, event)) {
        if (!row) return;
        k.view.copyOne(row.view.entry);
      } else if (event.metaKey || event.ctrlKey || event.altKey) return;
      else if (event.key === 'ArrowDown' || event.key === 'j') setCursor(Math.min(k.rows.length - 1, k.safeCursor + 1));
      else if (event.key === 'ArrowUp' || event.key === 'k') setCursor(Math.max(0, k.safeCursor - 1));
      else if ((event.key === 'Enter' || event.key === 'o' || event.key === 'O') && row) k.openRow(row);
      else if ((event.key === 'r' || event.key === 'R') && row) k.view.recheck(row.view.entry);
      else if (event.key === 's' || event.key === 'S') setSort(nextStatusSort(k.sort));
      else if (event.key === 'Escape') k.goBack();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    const unregister = registerShortcutOverviewGroup(PAGE_KEYS);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, [setSort]);

  const sortKey = (Object.entries(PASTED_LIST_SORT_BY).find(([, by]) => by === sort.by)?.[0] ?? null) as PastedListColumnKey | null;
  const counts = view.counts;

  return (
    <div data-pasted-list-page className="flex min-h-0 w-full flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 border-b border-border-hairline px-2 py-1">
          {counts.checking > 0 ? (
            <span className="mr-auto text-role-caption tabular-nums text-text-faint">Checking {counts.checking}</span>
          ) : null}
          <HoverTooltip label="Copy the numbers shown" shortcut="Mod + Alt + C" asChild>
            <IconButton ariaLabel="Copy the numbers shown" size="sm" onClick={() => void copyShown()} icon={<Copy aria-hidden className="size-4" />} />
          </HoverTooltip>
          <HoverTooltip label="Export the rows and columns shown as CSV" asChild>
            <Button size="sm" variant="ghost" icon={<Download aria-hidden />} onClick={exportShown} disabled={rows.length === 0} data-pasted-list-export>
              Export
            </Button>
          </HoverTooltip>
          <HoverTooltip label="Check every number again" asChild>
            <Button size="sm" variant="ghost" icon={<RefreshCw aria-hidden />} onClick={list.refetch} disabled={list.loading}>
              Recheck all
            </Button>
          </HoverTooltip>
          {/* Zoom, top-right: the sheet's type, rows and padding together. */}
          <div data-pasted-list-zoom className="flex items-center gap-0.5">
            <HoverTooltip label="Zoom out" asChild>
              <IconButton
                ariaLabel="Zoom out"
                size="sm"
                disabled={sheet.zoom <= SHEET_ZOOM_STEPS[0]}
                onClick={() => sheet.stepZoom(-1)}
                icon={<Minus aria-hidden className="size-4" />}
              />
            </HoverTooltip>
            <HoverTooltip label="Reset zoom to 100%" asChild>
              <Button size="sm" variant="ghost" onClick={() => sheet.stepZoom(0)} data-pasted-list-zoom-reset>
                <span className="w-9 text-center tabular-nums">{sheet.zoom}%</span>
              </Button>
            </HoverTooltip>
            <HoverTooltip label="Zoom in" asChild>
              <IconButton
                ariaLabel="Zoom in"
                size="sm"
                disabled={sheet.zoom >= SHEET_ZOOM_STEPS[SHEET_ZOOM_STEPS.length - 1]}
                onClick={() => sheet.stepZoom(1)}
                icon={<Plus aria-hidden className="size-4" />}
              />
            </HoverTooltip>
          </div>
        </div>
      {list.error ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline px-3 py-1.5 text-role-caption text-text-danger">
          <span className="min-w-0 flex-1 truncate">{list.error}</span>
          <Button size="sm" variant="ghost" onClick={list.refetch}>
            Retry
          </Button>
        </div>
      ) : null}
      <div
        data-grid-col-rules
        className="flex min-h-0 flex-1 flex-col"
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
          rows={rows}
          orderGroupsByDate={groups}
          getRowId={(row) => row.view.entry.ref}
          loading={list.selection.refs.length > 0 && list.loading && list.entries.every((e) => e.pending)}
          emptyMessage={
            needle
              ? `No pasted number matches “${query.trim()}”.`
              : 'Nothing pasted. Paste a list into the search bar, then open it full screen.'
          }
          sort={sortKey}
          dir={sort.dir}
          onSortChange={(key, dir) => {
            const by = PASTED_LIST_SORT_BY[key];
            if (by) setSort({ by, dir });
          }}
          ariaLabel="Pasted numbers"
          renderGroup={(group, _stripe, { columns }) => (
            <>
              {group.rows.map((row) => renderRow(row, columns))}
            </>
          )}
          renderRow={(row, _stripe, { columns }) => renderRow(row, columns)}
        />
      </div>
    </div>
  );

  function renderRow(row: PastedListRow, columns: readonly PastedListColumn[]) {
    const index = indexOf.get(row) ?? 0;
    return (
      <PastedListGridRow
        key={row.view.entry.ref}
        row={row}
        index={index}
        columns={columns}
        lit={index === safeCursor}
        cascade={cascade}
        onPoint={() => setCursor(index)}
        onOpen={() => openRow(row)}
        onCopy={(text) => void copyCell(text)}
      />
    );
  }
}

const PAGE_KEYS = {
  id: 'pasted-list-page',
  title: 'Pasted list',
  rows: [
    { keys: ['↑', '↓'], label: 'Move' },
    { keys: ['↵'], label: 'Open its record' },
    { keys: ['R'], label: 'Recheck' },
    { keys: ['mod', 'C'], label: 'Copy' },
    { keys: ['mod', 'alt', 'C'], label: 'Copy shown' },
    { keys: ['O'], label: 'Open its record' },
    { keys: ['S'], label: 'Sort by status' },
    { keys: ['Esc'], label: 'Back' },
  ],
};
