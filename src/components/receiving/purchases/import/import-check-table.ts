/**
 * `inbound-import-check.sheet` — the upload check's table (operator
 * 2026-10-06: "ensure that all the data is uploaded to the database tables
 * correctly"): one row per data row of the uploaded file, the file's own
 * columns in file order, each cell the file value beside the value that
 * landed. Display method: DataTable, HIGH (hundreds of rows × every file
 * column compared at a desk). The structural four (row · status · order ·
 * problem) are the binding's canonical columns; the file's columns mount per
 * batch (`importCheckSheetColumns`).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor, type LedgerGridColumnModel } from '@/design-system/components/grid';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { ImportCheckCell, ImportCheckColumn, ImportCheckRow, ImportRowStatus } from '@/lib/inbound/import-check';

export type ImportCheckColumnKey = 'row' | 'status' | 'order' | 'problem' | `file:${number}`;

export interface ImportCheckSheetColumn extends LedgerGridColumnModel {
  key: ImportCheckColumnKey;
  type?: ColumnType;
  /** A file column's index into `InboundImportCheck.columns` / `row.cells`. */
  fileIndex?: number;
}

const STRUCTURAL_COLUMNS: readonly ImportCheckSheetColumn[] = [
  { key: 'row', width: 'minmax(3rem, 3rem)', label: 'Row in the file', gridLabel: '#', type: 'number', align: 'end', frozen: true },
  { key: 'status', width: 'minmax(6.5rem, 6.5rem)', label: 'Status', gridLabel: 'Status', type: 'tag', frozen: true },
  { key: 'order', width: 'minmax(7rem, 7rem)', label: 'Order #', gridLabel: 'Order #', type: 'id', frozen: true },
  { key: 'problem', width: 'minmax(14rem, 14rem)', label: 'Why it was held or failed', gridLabel: 'Problem', type: 'text' },
];

/** What a file column's header says on hover: the field it was saved as and the DB column it landed in. */
function fileColumnTip(column: ImportCheckColumn): string {
  if (!column.field || !column.column) return `${column.header} — not saved`;
  return `${column.header} — ${column.label ?? column.field} · ${column.column}`;
}

/** The structural four, then one track per file column (header text = the file's header). */
export function importCheckSheetColumns(columns: readonly ImportCheckColumn[]): ImportCheckSheetColumn[] {
  return [
    ...STRUCTURAL_COLUMNS,
    ...columns.map(
      (column, index): ImportCheckSheetColumn => ({
        key: `file:${index}`,
        width: 'minmax(10rem, 10rem)',
        label: fileColumnTip(column),
        gridLabel: column.header,
        headerForceLabel: true,
        type: 'text',
        fileIndex: index,
      }),
    ),
  ];
}

/** Where the sheet's widths, freeze and zoom persist per browser. */
export const IMPORT_CHECK_LAYOUT_KEY = 'cf:sheet-columns:inbound-import-check';

export const IMPORT_ROW_STATUS_FACE: Readonly<Record<ImportRowStatus, { label: string; tone: string }>> = {
  landed: { label: 'Landed', tone: 'text-text-success' },
  unchanged: { label: 'Unchanged', tone: 'text-text-muted' },
  held: { label: 'Held', tone: 'text-text-warning' },
  failed: { label: 'Failed', tone: 'text-text-danger' },
};

export const importCheckRowKey = (row: ImportCheckRow): string => String(row.rowNumber);

export function importCheckCellOf(row: ImportCheckRow, column: ImportCheckSheetColumn): ImportCheckCell | null {
  return column.fileIndex == null ? null : (row.cells[column.fileIndex] ?? null);
}

/** The file side of a cell — a return reason carries its words beside the code. */
export function importFileValueText(cell: ImportCheckCell): string {
  return cell.decoded && cell.file ? `${cell.file} (${cell.decoded})` : cell.file;
}

/**
 * A cell as plain text — what a click copies, a drag copies as TSV and the
 * export writes. The order number is always the FULL value.
 */
export function importCheckCellText(row: ImportCheckRow, column: ImportCheckSheetColumn): string {
  switch (column.key) {
    case 'row':
      return String(row.rowNumber);
    case 'status':
      return IMPORT_ROW_STATUS_FACE[row.status].label;
    case 'order':
      return row.orderNumber ?? '';
    case 'problem':
      return row.problem ?? '';
    default: {
      const cell = importCheckCellOf(row, column);
      if (!cell || cell.state === 'blank') return '';
      if (cell.state === 'different') return `${importFileValueText(cell)} → ${cell.saved ?? ''}`;
      return importFileValueText(cell);
    }
  }
}

/** What a cell says on hover: both values and where the value lives. */
export function importCheckCellHint(row: ImportCheckRow, column: ImportCheckSheetColumn): string {
  const cell = importCheckCellOf(row, column);
  if (!cell) return importCheckCellText(row, column);
  if (cell.state === 'blank') return '';
  const where = column.label ?? '';
  if (cell.state === 'not_saved') return `File: ${importFileValueText(cell)}\nNot saved\n${where}`;
  return `File: ${importFileValueText(cell)}\nSaved: ${cell.saved ?? '(blank)'}\n${where}`;
}

/** Read-only: no selection, no day bands — a file to read against what landed. */
export const IMPORT_CHECK_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

export function makeImportCheckDescriptor(
  columns: readonly ImportCheckSheetColumn[],
): GridSurfaceDescriptor<ImportCheckRow, ImportCheckSheetColumn> {
  return makeGridSurfaceDescriptor<ImportCheckRow, ImportCheckSheetColumn>(
    'inbound-import-check.sheet',
    columns,
    {
      isSortable: () => false,
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    IMPORT_CHECK_CAPABILITIES,
  );
}

const IMPORT_CHECK_DEFINITION = parseTableDefinition({
  id: 'inbound-import-check.sheet',
  tableId: 'inbound-import-check',
  entityFamily: 'inbound-import-check',
  cellMapKey: 'inbound-import-check',
  ariaLabel: 'Uploaded file rows',
  testId: 'import-check-grid',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: IMPORT_CHECK_CAPABILITIES,
  columns: STRUCTURAL_COLUMNS,
});

export const IMPORT_CHECK_TABLE_BINDING: TableSurfaceBinding<ImportCheckRow, ImportCheckSheetColumn> = {
  definition: IMPORT_CHECK_DEFINITION,
  columns: STRUCTURAL_COLUMNS,
  makeDescriptor: makeImportCheckDescriptor,
  recordPlane: { kind: 'none', reason: 'A file row is read and copied here; its purchase order opens from Purchasing.' },
};
