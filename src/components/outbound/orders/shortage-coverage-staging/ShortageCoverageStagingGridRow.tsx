'use client';

/**
 * One Shortage coverage staging row — parsed Amazon OOS demand, triage in
 * `status`, coverage face from {@link shortageCoverageFace} (same string as
 * live Shortage). Read-only; fix on the rail Row leaf or remapping.
 */

import { memo } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  LedgerGridLeafRow,
  gridCellAlignClass,
} from '@/design-system/components/grid';
import { CSV_SHORTAGE_COVERAGE_FIELDS } from '@/lib/orders/csv-shortage-coverage-import';
import type { ShortageCoverageImportRowView } from '@/lib/orders/shortage-coverage-import-descriptor';
import { shortageCoverageFace } from '@/lib/orders/shortage-coverage';
import { TableImportTriageStatusCell } from '@/components/tables/import/TableImportTriageStatusCell';
import { cn } from '@/utils/_cn';
import { SHORTAGE_COVERAGE_STAGING_GRID_CAPABILITIES } from './shortage-coverage-staging-grid-descriptor';
import {
  SHORTAGE_COVERAGE_STAGING_GRID_FROZEN_CELL,
  shortageCoverageStagingGridCell,
  shortageCoverageStagingGridFrozenLeft,
  shortageCoverageStagingGridTemplate,
  type ShortageCoverageStagingGridColumn,
} from './shortage-coverage-staging-grid-layout';

export function shortageCoverageStagingRowKey(row: ShortageCoverageImportRowView): string {
  return `shortage-staging:${row.index}`;
}

const FIELD_LABEL = new Map(
  CSV_SHORTAGE_COVERAGE_FIELDS.map((f) => [f.key, f.label] as const),
);

function missingLabel(row: ShortageCoverageImportRowView): string | null {
  if (row.duplicate) return 'Duplicate order + SKU in this file';
  if (row.missing.length === 0) return null;
  return `Missing: ${row.missing.map((k) => FIELD_LABEL.get(k) ?? k).join(', ')}`;
}

const MISSING_CELL_CLASS = 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';

interface ShortageCoverageStagingGridRowProps {
  row: ShortageCoverageImportRowView;
  checked: boolean;
  focused: boolean;
  onToggle: (index: number) => void;
  onOpen: (index: number) => void;
  columns: readonly ShortageCoverageStagingGridColumn[];
}

export const ShortageCoverageStagingGridRow = memo(function ShortageCoverageStagingGridRow({
  row,
  checked,
  focused,
  onToggle,
  onOpen,
  columns,
}: ShortageCoverageStagingGridRowProps) {
  const reason = missingLabel(row);

  const renderValue = (key: string) => {
    switch (key) {
      case 'shortage-coverage-import.order':
        return row.orderNumber ? (
          <CopyableCellValue value={row.orderNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'status':
        return <TableImportTriageStatusCell status={row.status} tooltip={reason} />;
      case 'shortage-coverage-import.title':
        return row.itemTitle ? (
          <span className="truncate">{row.itemTitle}</span>
        ) : (
          <GridCellDash />
        );
      case 'shortage-coverage-import.qty':
        return row.shortQty ? (
          <span className="truncate tabular-nums">{row.shortQty}</span>
        ) : (
          <GridCellDash />
        );
      case 'shortage-coverage-import.coverage':
        return (
          <span className="truncate">
            {shortageCoverageFace({
              poNumber: row.poNumber,
              inboundTracking: row.inboundTracking,
              eta: row.eta,
            })}
          </span>
        );
      case 'shortage-coverage-import.po':
        return row.poNumber ? (
          <CopyableCellValue value={row.poNumber} dense />
        ) : (
          <GridCellDash />
        );
      case 'shortage-coverage-import.inbound':
        return row.inboundTracking ? (
          <CopyableCellValue value={row.inboundTracking} dense />
        ) : (
          <GridCellDash />
        );
      default:
        return null;
    }
  };

  return (
    <LedgerGridLeafRow<ShortageCoverageStagingGridColumn>
      columns={columns}
      template={shortageCoverageStagingGridTemplate(columns)}
      selected={focused}
      capabilities={SHORTAGE_COVERAGE_STAGING_GRID_CAPABILITIES}
      data-staging-row={row.index}
      data-staging-status={row.status}
      className="cursor-pointer"
      onClick={() => onOpen(row.index)}
      renderCell={(col, { rule }) => {
        if (col.key === 'select') {
          return (
            <div
              className={cn(
                shortageCoverageStagingGridCell({ inset: 'none', rule }),
                col.frozen === true && SHORTAGE_COVERAGE_STAGING_GRID_FROZEN_CELL,
                'justify-center',
              )}
              style={{ left: shortageCoverageStagingGridFrozenLeft(columns, 'select') }}
            >
              <GridRowCheckbox
                checked={checked}
                onToggle={() => onToggle(row.index)}
                label={`Select staging row ${row.index + 1}`}
              />
            </div>
          );
        }

        const key =
          col.fieldId ??
          (col.key === 'order'
            ? 'shortage-coverage-import.order'
            : col.key === 'status'
              ? 'status'
              : col.key);
        const frozen = col.frozen === true;
        const missing =
          (key === 'shortage-coverage-import.order' && row.missing.includes('order_number')) ||
          (key === 'shortage-coverage-import.title' && row.missing.includes('item_title')) ||
          (key === 'shortage-coverage-import.qty' && row.missing.includes('short_qty'));

        return (
          <div
            className={cn(
              shortageCoverageStagingGridCell({ inset: 'grid', rule }),
              gridCellAlignClass(col),
              frozen && SHORTAGE_COVERAGE_STAGING_GRID_FROZEN_CELL,
              'text-role-caption text-text-default',
              missing && MISSING_CELL_CLASS,
            )}
            style={frozen ? { left: shortageCoverageStagingGridFrozenLeft(columns, col.key) } : undefined}
          >
            {renderValue(key)}
          </div>
        );
      }}
    />
  );
});
