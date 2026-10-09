'use client';

/** Location-table selection verbs, painted by DataTable's canonical header bar. */

import { useCallback, useMemo } from 'react';
import { toast } from '@/lib/toast';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { Copy, Download, Printer, Trash2 } from '@/components/Icons';
import { DELETE_HOTKEY } from '@/lib/keyboard/key-registry';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { locationLabelPrintSummary } from '@/lib/print/printLocationRows';
import {
  BINS_COPY_HEADER,
  formatBinsCopyRow,
  toTsvBlock,
} from '@/lib/station/format-station-copy-row';

interface Props {
  selected: Set<number>;
  rows: BinsOverviewRow[];
  onDeleteSelected: (ids: number[]) => void;
}

export function BinsSelectionActions({ selected, rows, onDeleteSelected }: Props) {
  const count = selected.size;
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const printLocationLabels = useLocationLabelPrint();

  const copyTsv = useCallback(() => {
    if (selectedRows.length === 0) return;
    const block = toTsvBlock(BINS_COPY_HEADER, selectedRows.map(formatBinsCopyRow));
    void navigator.clipboard.writeText(block).then(
      () => toast.success(`Copied ${selectedRows.length} bin${selectedRows.length === 1 ? '' : 's'}`),
      () => toast.error('Copy failed'),
    );
  }, [selectedRows]);

  const exportCsv = useCallback(() => {
    if (selectedRows.length === 0) return;
    const header = [
      'barcode', 'room', 'zone_letter', 'row_label', 'col_label',
      'total_qty', 'sku_count', 'capacity', 'fill_pct',
      'last_counted', 'is_empty', 'has_low_stock', 'is_over_capacity', 'is_stale',
    ];
    const csvRows = selectedRows.map((r) => [
      r.barcode ?? '', r.room ?? '', r.zone_letter ?? '',
      r.row_label ?? '', r.col_label ?? '',
      r.total_qty, r.sku_count, r.capacity ?? '',
      r.fill_pct != null ? (r.fill_pct * 100).toFixed(1) : '',
      r.last_counted ?? '',
      r.is_empty, r.has_low_stock, r.is_over_capacity, r.is_stale,
    ]);
    const csv = [header, ...csvRows]
      .map((line) =>
        line.map((cell) => {
          const s = String(cell);
          // Quote anything with comma, quote, or newline.
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bins-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedRows.length} bin${selectedRows.length === 1 ? '' : 's'}`);
  }, [selectedRows]);

  // Every selected row prints here, now: rack addresses as location faces,
  // anything else as a 2×1 flat location face — one run on the shared label
  // channel.
  const printLabels = useCallback(() => {
    if (selectedRows.length === 0) return;
    void printLocationLabels(
      selectedRows.map((r) => ({
        id: r.id,
        name: r.name,
        barcode: r.barcode,
        roomName: r.room,
      })),
    ).then(
      (result) => {
        const message = locationLabelPrintSummary(result);
        if (result.transport === 'skipped') toast.error(message);
        else toast.success(message);
      },
      (err: unknown) => toast.error(err instanceof Error ? err.message : 'Print failed'),
    );
  }, [printLocationLabels, selectedRows]);

  const verbs = useMemo<RecordActionVerb[]>(() => [
    {
      id: 'print',
      label: `Print ${count} label${count === 1 ? '' : 's'}`,
      icon: <Printer />,
      run: printLabels,
    },
    { id: 'copy', label: 'Copy', icon: <Copy />, run: copyTsv },
    { id: 'export', label: 'Export CSV', icon: <Download />, run: exportCsv },
    {
      id: 'cycle-count',
      label: 'Mark for cycle count',
      run: () => { toast('Cycle counts arrive in the next update.'); },
    },
    {
      id: 'delete',
      label: `Delete ${count} location${count === 1 ? '' : 's'}`,
      icon: <Trash2 />,
      tone: 'danger',
      hotkey: DELETE_HOTKEY,
      run: () => onDeleteSelected(selectedRows.map((row) => row.id)),
    },
  ], [copyTsv, count, exportCsv, onDeleteSelected, printLabels, selectedRows]);

  return (
    <RecordActionStrip
      verbs={verbs}
      label={`${count} selected location${count === 1 ? '' : 's'} actions`}
      testId="bins-selection-actions"
      face="header"
    />
  );
}
