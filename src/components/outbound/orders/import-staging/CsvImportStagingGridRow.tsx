'use client';

/**
 * One CSV staging row — the parsed record's REAL details in the data table,
 * with its triage state in the `status` column.
 *
 * **Read-only.** A value is corrected on the record plane (the rail's Row leaf)
 * or by re-mapping the source column, never in the cell; the row's triage state
 * is derived on read, so the fix flips Ready / Action required either way.
 *
 * Click opens the row on the rail's Row leaf; the gutter check toggles bulk
 * membership. A missing mapped field paints its own cell rose, so the operator
 * sees *which* value is the reason without opening it.
 */

import { memo } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash, GridPlatformMarkValue, GridStatusCellValue } from '@/components/ui/grid-cells';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  LedgerGridLeafRow,
  gridCellAlignClass,
} from '@/design-system/components/grid';
import { CSV_ORDER_CANONICAL_FIELDS } from '@/lib/orders/csv-order-import';
import {
  type OrderImportRowView,
} from '@/lib/orders/order-import-descriptor';
import { cn } from '@/utils/_cn';
import { CSV_IMPORT_STAGING_GRID_CAPABILITIES } from './csv-import-staging-grid-descriptor';
import {
  CSV_IMPORT_STAGING_GRID_COLUMNS,
  CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  csvImportStagingGridCell,
  csvImportStagingGridFrozenLeft,
  csvImportStagingGridTemplate,
  isCsvImportStagingGridFrozen,
  type CsvImportStagingGridColumn,
  type CsvImportStagingGridColumnKey,
} from './csv-import-staging-grid-layout';

/** Stable row key — the draft index is the row's identity in a session draft. */
export function csvImportStagingRowKey(row: OrderImportRowView): string {
  return `staging:${row.index}`;
}

const FIELD_LABEL = new Map(
  CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, f.label] as const),
);

/** "Missing: Order number, SKU" — the reason Confirm would skip this row. */
function csvImportStagingMissingLabel(row: OrderImportRowView): string | null {
  if (row.missing.length === 0) return null;
  return `Missing: ${row.missing.map((k) => FIELD_LABEL.get(k) ?? k).join(', ')}`;
}

/** Rose wash for the one cell whose value is why the row cannot be imported. */
const MISSING_CELL_CLASS = 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';

interface CsvImportStagingGridRowProps {
  row: OrderImportRowView;
  /** Bulk membership — what Confirm acts on. */
  checked: boolean;
  /** Open on the record plane (right rail). */
  focused: boolean;
  onToggle: (index: number) => void;
  onOpen: (index: number) => void;
  columns?: readonly CsvImportStagingGridColumn[];
}

export const CsvImportStagingGridRow = memo(function CsvImportStagingGridRow({
  row,
  checked,
  focused,
  onToggle,
  onOpen,
  columns = CSV_IMPORT_STAGING_GRID_COLUMNS,
}: CsvImportStagingGridRowProps) {
  const missingLabel = csvImportStagingMissingLabel(row);
  const cellValue = (key: CsvImportStagingGridColumnKey): string => {
    switch (key) {
      case 'order':
        return row.orderNumber;
      case 'sku':
        return row.sku;
      case 'qty':
        return row.quantity;
      case 'customer':
        return row.customerName;
      case 'tracking':
        return row.trackingNumber;
      case 'platform':
        return row.platform;
      default:
        return '';
    }
  };

  const renderValue = (key: CsvImportStagingGridColumnKey) => {
    switch (key) {
      case 'order':
        return row.orderNumber ? (
          <CopyableCellValue value={row.orderNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'status':
        return (
          <GridStatusCellValue
            label={row.status === 'ready' ? 'Ready' : 'Action required'}
            toneClass={
              row.status === 'ready'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800'
            }
            dotClass={row.status === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'}
            tooltip={missingLabel}
          />
        );
      case 'sku':
        return row.sku ? <CopyableCellValue value={row.sku} dense /> : <GridCellDash />;
      case 'qty':
        return row.quantity ? (
          <span className="truncate tabular-nums">{row.quantity}</span>
        ) : (
          <GridCellDash />
        );
      case 'customer':
        return row.customerName ? (
          <span className="truncate">{row.customerName}</span>
        ) : (
          <GridCellDash />
        );
      case 'tracking':
        return row.trackingNumber ? (
          <CopyableCellValue value={row.trackingNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'platform': {
        const platform = sourcePlatformMeta(row.platform);
        return platform.value || row.platform ? (
          <GridPlatformMarkValue
            platformValue={platform.value || null}
            label={platform.label || row.platform}
            meta={platform.value ? platform : undefined}
          />
        ) : (
          <GridCellDash />
        );
      }
      default:
        return null;
    }
  };

  return (
    <LedgerGridLeafRow<CsvImportStagingGridColumn>
      columns={columns}
      template={csvImportStagingGridTemplate(columns)}
      selected={focused}
      capabilities={CSV_IMPORT_STAGING_GRID_CAPABILITIES}
      // No `role="row"`: LedgerGrid body rows sit outside the header rowgroup,
      // so the role would be orphaned (`grid-aria-roles.guard.test.ts`). The
      // gutter checkbox, the editable cells and the rail are the keyboard-
      // reachable controls.
      data-staging-row={row.index}
      data-staging-status={row.status}
      className="cursor-pointer"
      onClick={() => onOpen(row.index)}
      renderCell={(col, { rule }) => {
        if (col.key === 'select') {
          return (
            <div
              className={cn(
                csvImportStagingGridCell({ inset: 'none', rule }),
                isCsvImportStagingGridFrozen(col.key) && CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
                'justify-center',
              )}
              style={{ left: csvImportStagingGridFrozenLeft('select') }}
            >
              <GridRowCheckbox
                checked={checked}
                onToggle={() => onToggle(row.index)}
                label={`Select staging row ${row.index + 1}`}
              />
            </div>
          );
        }

        const key = col.key;
        const frozen = isCsvImportStagingGridFrozen(key);
        const missing =
          (key === 'order' && row.missing.includes('order_number')) ||
          (key === 'sku' && row.missing.includes('sku'));

        return (
          <div
            className={cn(
              csvImportStagingGridCell({ inset: 'grid', rule }),
              gridCellAlignClass(col),
              frozen && CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
              'text-role-caption text-text-default',
              missing && MISSING_CELL_CLASS,
            )}
            style={frozen ? { left: csvImportStagingGridFrozenLeft(key) } : undefined}
          >
            {renderValue(key)}
          </div>
        );
      }}
    />
  );
});
