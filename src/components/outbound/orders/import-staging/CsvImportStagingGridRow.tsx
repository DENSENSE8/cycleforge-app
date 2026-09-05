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
import { GridCellDash, GridPlatformMarkValue } from '@/components/ui/grid-cells';
import { TableImportTriageStatusCell } from '@/components/tables/import/TableImportTriageStatusCell';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import type { TableImportRowDecision } from '@/lib/tables/import/types';
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
import { ImportDecisionSquare } from './ImportDecisionSquare';
import {
  CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
  csvImportStagingGridCell,
  csvImportStagingGridFrozenLeft,
  csvImportStagingGridTemplate,
  type CsvImportStagingGridColumn,
} from './csv-import-staging-grid-layout';

/**
 * Stable row key — the draft's minted id, never the row index.
 *
 * A sheet sync splices rows into the MIDDLE of an open board, which renumbers
 * every row below the seam. Keying on `row.index` remounted all of them, so
 * the rows that were supposed to visibly make room instead vanished and
 * re-entered. `TableImportDraft.rowIds` survives the splice.
 */
export function csvImportStagingRowKey(
  row: OrderImportRowView,
  rowIds: readonly string[],
): string {
  return rowIds[row.index] ?? `staging:${row.index}`;
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
  columns: readonly CsvImportStagingGridColumn[];
  /**
   * This row's operator verdict on a DECISION board. Undefined means undecided;
   * the whole prop is absent on a file draft, which is what leaves the
   * `actions` gutter an empty chrome cell there.
   */
  decision?: TableImportRowDecision;
  /**
   * Present only on a decision board (a `google_sheets`-origin draft). Its
   * absence is what decides whether the squares paint at all — no second
   * "isSheetBoard" flag to fall out of sync with the handler.
   */
  onDecide?: (index: number, action: 'approve' | 'reject') => void;
}

export const CsvImportStagingGridRow = memo(function CsvImportStagingGridRow({
  row,
  checked,
  focused,
  onToggle,
  onOpen,
  columns,
  decision,
  onDecide,
}: CsvImportStagingGridRowProps) {
  const missingLabel = csvImportStagingMissingLabel(row);
  const renderValue = (key: string) => {
    switch (key) {
      case 'orders-import.order':
        return row.orderNumber ? (
          <CopyableCellValue value={row.orderNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'status':
        return <TableImportTriageStatusCell status={row.status} tooltip={missingLabel} />;
      case 'orders-import.sku':
        return row.sku ? <CopyableCellValue value={row.sku} dense /> : <GridCellDash />;
      case 'orders-import.qty':
        return row.quantity ? (
          <span className="truncate tabular-nums">{row.quantity}</span>
        ) : (
          <GridCellDash />
        );
      case 'orders-import.customer':
        return row.customerName ? (
          <span className="truncate">{row.customerName}</span>
        ) : (
          <GridCellDash />
        );
      case 'orders-import.tracking':
        return row.trackingNumber ? (
          <CopyableCellValue value={row.trackingNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'orders-import.platform': {
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
                col.frozen === true && CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
                'justify-center',
              )}
              style={{ left: csvImportStagingGridFrozenLeft(columns, 'select') }}
            >
              <GridRowCheckbox
                checked={checked}
                onToggle={() => onToggle(row.index)}
                label={`Select staging row ${row.index + 1}`}
              />
            </div>
          );
        }

        if (col.key === 'actions') {
          return (
            <div
              className={cn(
                csvImportStagingGridCell({ inset: 'none', rule: false }),
                'justify-end',
              )}
            >
              {onDecide ? (
                <>
                  <ImportDecisionSquare
                    tone="approve"
                    active={decision === 'approved'}
                    label={
                      decision === 'approved'
                        ? `Unapprove order ${row.orderNumber || row.index + 1}`
                        : `Approve order ${row.orderNumber || row.index + 1}`
                    }
                    onPress={() => onDecide(row.index, 'approve')}
                  />
                  <ImportDecisionSquare
                    tone="reject"
                    active={decision === 'rejected'}
                    label={
                      decision === 'rejected'
                        ? `Un-reject order ${row.orderNumber || row.index + 1}`
                        : `Reject order ${row.orderNumber || row.index + 1}`
                    }
                    onPress={() => onDecide(row.index, 'reject')}
                  />
                </>
              ) : null}
            </div>
          );
        }

        // Cells speak in FIELD ids since the wave 1.4 slot port; the two
        // structural fact tracks map onto theirs so one switch serves both.
        const key =
          col.fieldId ??
          (col.key === 'order' ? 'orders-import.order' : col.key === 'status' ? 'status' : col.key);
        const frozen = col.frozen === true;
        const missing =
          (key === 'orders-import.order' && row.missing.includes('order_number')) ||
          (key === 'orders-import.sku' && row.missing.includes('sku'));

        return (
          <div
            className={cn(
              csvImportStagingGridCell({ inset: 'grid', rule }),
              gridCellAlignClass(col),
              frozen && CSV_IMPORT_STAGING_GRID_FROZEN_CELL,
              'text-role-caption text-text-default',
              missing && MISSING_CELL_CLASS,
            )}
            style={frozen ? { left: csvImportStagingGridFrozenLeft(columns, col.key) } : undefined}
          >
            {renderValue(key)}
          </div>
        );
      }}
    />
  );
});
