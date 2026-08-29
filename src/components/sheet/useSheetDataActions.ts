'use client';

/**
 * Copy · Export · Print, derived from whatever the grid registered as its
 * {@link SheetDataSource}.
 *
 * One hook so the three verbs cannot drift apart. They answer the same question
 * — "what is on screen right now?" — and the failure mode when each is wired
 * per surface is that Copy takes the filtered rows, Export takes the fetched
 * page, and Print takes the thirty rows the virtualizer has mounted. All three
 * read the same producer here, so they are the same rows by construction.
 *
 * Returns `undefined` handlers when no source is registered, which is what makes
 * the toolbar group honestly absent rather than three buttons that do nothing.
 */

import { useCallback, useMemo } from 'react';
import { useSheetChrome } from '@/components/sheet/sheet-chrome-context';
import {
  sheetCopyToastMessage,
  toSheetTsv,
  writeSheetClipboard,
} from '@/lib/sheet/sheet-clipboard';
import { printSheet } from '@/lib/sheet/sheet-print';
import { toast } from '@/lib/toast';

export interface SheetDataActions {
  onCopyAll?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
}

/** `To-ship · Must ship` → `to-ship-must-ship-2026-08-29.csv` */
function exportFilename(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sheet';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${stamp}.csv`;
}

/**
 * CSV, for the FILE.
 *
 * The clipboard gets TSV because that is what a spreadsheet pastes as a grid; a
 * file gets CSV because that is what every downstream importer expects from a
 * `.csv`. RFC-4180 quoting: a field is wrapped when it holds a comma, a quote or
 * a newline, and an embedded quote is doubled.
 */
function toCsv(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [columns.map(cell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((_, i) => cell(row[i] ?? '')).join(','));
  }
  // CRLF: Excel on Windows reads a lone LF as one giant cell.
  return lines.join('\r\n');
}

function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel reads UTF-8 rather than mangling every non-ASCII item title.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function useSheetDataActions(options?: {
  /** Printed under the print title — the filter state, in words. */
  printSubtitle?: string;
}): SheetDataActions {
  const { dataSource } = useSheetChrome();
  const printSubtitle = options?.printSubtitle;

  const onCopyAll = useCallback(async () => {
    if (!dataSource) return;
    const columns = dataSource.columns();
    const rows = dataSource.rows();
    const tsv = toSheetTsv(rows, columns.map((label, i) => ({
      key: label,
      label,
      copyValue: (row: readonly string[]) => row[i],
    })));
    const ok = await writeSheetClipboard(tsv);
    // Tell the operator what actually happened. An unconditional "Copied" after
    // a blocked clipboard write is the toast that costs someone a paste.
    if (ok) toast.success(sheetCopyToastMessage(rows.length));
    else toast.error('Could not reach the clipboard');
  }, [dataSource]);

  const onExport = useCallback(() => {
    if (!dataSource) return;
    const rows = dataSource.rows();
    downloadCsv(exportFilename(dataSource.title), toCsv(dataSource.columns(), rows));
    toast.success(`Exported ${rows.length.toLocaleString()} rows`);
  }, [dataSource]);

  const onPrint = useCallback(() => {
    if (!dataSource) return;
    printSheet({
      title: dataSource.title,
      columns: dataSource.columns(),
      rows: dataSource.rows(),
      subtitle: printSubtitle,
    });
  }, [dataSource, printSubtitle]);

  return useMemo(
    () =>
      dataSource
        ? {
            onCopyAll: () => void onCopyAll(),
            onExport,
            onPrint,
          }
        : {},
    [dataSource, onCopyAll, onExport, onPrint],
  );
}
