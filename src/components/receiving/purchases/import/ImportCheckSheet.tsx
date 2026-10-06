'use client';

/**
 * The upload check's sheet — every data row of one uploaded file, every file
 * column, the file value against what landed (operator 2026-10-06). Built on
 * the same sheet primitives as the located-records sheet (`PastedListSheet`):
 * `DataTable` + a binding, `useSheetColumns` widths / freeze / zoom, the
 * full-screen toggle, row hairlines, `useCellRangeSelection` click-to-copy
 * (the full value, toasted) and drag-to-copy as TSV.
 *
 * The top row is the counts as plain words — the sheet has no status
 * control (sidebar law: a filter would be a `NAV_PAGE_DECLS` declaration).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { SHEET_ZOOM_STEPS, useSheetColumns } from '@/components/tables/useSheetColumns';
import { ZoomMenu } from '@/components/tables/DataTableZoomToggle';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Download } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { ListFocusToggle } from '@/design-system/components/ListFocusToggle';
import { useCellRangeSelection, type CellRange } from '@/design-system/components/grid/useCellRangeSelection';
import { SHEET_HEADER } from '@/components/search/pasted-list/PastedListSheet';
import type { RowRangeSlice } from '@/components/search/pasted-list/PastedListGridRow';
import type { InboundImportCheck, ImportCheckRow } from '@/lib/inbound/import-check';
import { downloadExport } from '@/lib/tables/export/download';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { COPY_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';
import { ImportCheckGridRow } from './ImportCheckGridRow';
import {
  IMPORT_CHECK_LAYOUT_KEY,
  IMPORT_CHECK_TABLE_BINDING,
  importCheckCellText,
  importCheckRowKey,
  importCheckSheetColumns,
  type ImportCheckColumnKey,
  type ImportCheckSheetColumn,
} from './import-check-table';

const NOUN = { one: 'row', many: 'rows' } as const;

/** "1,204" — counts read at a glance. */
const count = (n: number) => n.toLocaleString('en-US');

/** The counts over the header row: plain words, the problem counts in their tone only when non-zero. */
function ImportCheckCounts({ counts }: { counts: InboundImportCheck['counts'] }) {
  const parts: Array<{ key: string; text: string; tone?: string }> = [
    { key: 'rows', text: `${count(counts.rows)} ${counts.rows === 1 ? 'row' : 'rows'}` },
    { key: 'landed', text: `${count(counts.landed)} landed` },
    { key: 'unchanged', text: `${count(counts.unchanged)} unchanged` },
    { key: 'held', text: `${count(counts.held)} held`, tone: counts.held > 0 ? 'text-text-warning' : undefined },
    { key: 'failed', text: `${count(counts.failed)} failed`, tone: counts.failed > 0 ? 'text-text-danger' : undefined },
    { key: 'matching', text: `${count(counts.cellsMatching)} ${counts.cellsMatching === 1 ? 'cell matches' : 'cells match'}` },
    {
      key: 'differing',
      text: `${count(counts.cellsDiffering)} ${counts.cellsDiffering === 1 ? 'cell differs' : 'cells differ'}`,
      tone: counts.cellsDiffering > 0 ? 'font-medium text-text-danger' : undefined,
    },
  ];
  return (
    <p data-import-check-counts className="flex min-w-0 flex-wrap items-center gap-x-1 text-role-caption tabular-nums text-text-muted">
      {parts.map((part, i) => (
        <span key={part.key} className={cn('whitespace-nowrap', part.tone)}>
          {i > 0 ? <span aria-hidden className="pr-1 text-text-faint">·</span> : null}
          {part.text}
        </span>
      ))}
    </p>
  );
}

export function ImportCheckSheet({ check, lead }: { check: InboundImportCheck; lead?: ReactNode }) {
  const rows = check.rows;
  const mounted = useMemo(() => importCheckSheetColumns(check.columns), [check.columns]);
  const sheet = useSheetColumns(IMPORT_CHECK_LAYOUT_KEY, mounted);
  const groups = useMemo<[string, RowGroup<ImportCheckRow>[]][]>(
    () => [['', rows.map((row) => ({ key: importCheckRowKey(row), rows: [row] }))]],
    [rows],
  );
  const indexOf = useMemo(() => new Map(rows.map((row, index) => [row, index])), [rows]);
  const [cursor, setCursor] = useState(0);

  const fileName = check.batch.fileName ?? `Upload ${check.batch.id}`;
  // Export: the columns on screen, in the staffer's order, every row — the cells as the sheet copies them.
  const exportShown = useCallback(() => {
    const shown = sheet.columns;
    downloadExport(
      shown.map((column) => column.gridLabel ?? column.label ?? column.key),
      rows.map((row) => shown.map((column) => importCheckCellText(row, column))),
      `upload-check-${check.batch.id}`,
      'csv',
    );
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? NOUN.one : NOUN.many}`);
  }, [rows, sheet.columns, check.batch.id]);

  // A press on a cell copies it — the full value — and toasts it; a drag (or Shift+press) copies the range as TSV.
  const hostRef = useRef<HTMLDivElement>(null);
  const colKeys = useMemo(() => sheet.columns.map((column) => column.key), [sheet.columns]);
  const [flash, setFlash] = useState<{ row: number; col: ImportCheckColumnKey; n: number } | null>(null);
  const copyRange = useCallback(
    async (range: CellRange) => {
      const cols = sheet.columns.slice(range.c0, range.c1 + 1);
      const tsv = rows
        .slice(range.r0, range.r1 + 1)
        .map((row) => cols.map((column) => importCheckCellText(row, column)).join('\t'))
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
      const column = sheet.columns[cell.col];
      if (!row || !column) return;
      setCursor(cell.row);
      const text = importCheckCellText(row, column);
      if (!text) return;
      setFlash((last) => ({ row: cell.row, col: column.key, n: (last?.n ?? 0) + 1 }));
      void copyToClipboard(text).then((ok) => ok && toast.success(`Copied ${text}`));
    },
  });

  // ⌘C copies the selected range; Esc drops it.
  const keys = useRef({ cells, copyRange });
  keys.current = { cells, copyRange };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const { cells: selection, copyRange: copy } = keys.current;
      if (!selection.range) return;
      if (hotkeyFires(COPY_HOTKEY, event)) void copy(selection.range);
      else if (event.key === 'Escape') selection.clear();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));

  return (
    <div data-import-check className="flex min-h-0 w-full flex-1 flex-col">
      {/* ONE row directly over the header row: the file, its counts (plain words, never chips), the tools right. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline px-2 py-1">
        {lead}
        <span className="min-w-0 max-w-[24rem] shrink truncate text-role-caption font-medium text-text-default" title={fileName}>
          {fileName}
        </span>
        <ImportCheckCounts counts={check.counts} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <HoverTooltip label="Export" asChild>
            <IconButton
              ariaLabel="Export"
              size="sm"
              onClick={exportShown}
              disabled={rows.length === 0}
              icon={<Download aria-hidden className="size-4" />}
            />
          </HoverTooltip>
          <ZoomMenu value={sheet.zoom} steps={SHEET_ZOOM_STEPS} onChange={sheet.setZoom} testId="import-check-zoom" />
          <ListFocusToggle />
        </div>
      </div>
      <div
        ref={hostRef}
        data-grid-col-rules
        data-cell-dragging={cells.dragging || undefined}
        onPointerDown={cells.onPointerDown}
        className={cn('flex min-h-0 flex-1 flex-col', cells.dragging && 'select-none')}
        style={{ '--cf-density': String(sheet.zoom / 100) } as CSSProperties}
      >
        <DataTable<ImportCheckRow, ImportCheckColumnKey, ImportCheckSheetColumn>
          binding={IMPORT_CHECK_TABLE_BINDING}
          columns={sheet.columns}
          onResizeColumn={sheet.onResizeColumn}
          onFreezeColumn={sheet.onFreezeColumn}
          className={SHEET_HEADER}
          hideToolbar
          unpaged
          rowNoun={NOUN}
          rows={rows}
          orderGroupsByDate={groups}
          getRowId={importCheckRowKey}
          loading={false}
          emptyMessage="This file had no data rows."
          isSortable={() => false}
          sort={null}
          dir={null}
          onSortChange={() => undefined}
          ariaLabel={`Rows of ${fileName}`}
          renderGroup={(group, _stripe, { columns }) => <>{group.rows.map((row) => renderRow(row, columns))}</>}
          renderRow={(row, _stripe, { columns }) => renderRow(row, columns)}
        />
      </div>
    </div>
  );

  function renderRow(row: ImportCheckRow, columns: readonly ImportCheckSheetColumn[]) {
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
      <ImportCheckGridRow
        key={importCheckRowKey(row)}
        row={row}
        index={index}
        columns={columns}
        lit={index === safeCursor}
        range={slice}
        flash={flash?.row === index ? flash : null}
        onPoint={() => setCursor(index)}
      />
    );
  }
}
