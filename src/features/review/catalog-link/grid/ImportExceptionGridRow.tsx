'use client';

/**
 * One Review · Missing item number row — CSS-grid columns matching
 * {@link IMPORT_EXCEPTION_GRID_COLUMNS}.
 *
 * Read-only. The Item Number this row is missing is **not** an in-cell field:
 * supplying it re-runs the sheet → order import path and creates an order, so it
 * is the record plane's job (`display/workbench.md` → Action planes). The row
 * opens `?exceptionId=` and the right-rail form takes it from there.
 */

import { Fragment, memo, type ReactNode } from 'react';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateCellValue, GridPlatformMarkValue } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { formatDateKeyShort, formatDateTimePST, toPSTDateKey } from '@/utils/date';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import { cn } from '@/utils/_cn';
import { CATALOG_LINK_GRID_CAPABILITIES } from './catalog-link-grid-descriptor';
import {
  IMPORT_EXCEPTION_GRID_COLUMNS,
  IMPORT_EXCEPTION_GRID_FROZEN_CELL,
  importExceptionGridCell,
  importExceptionGridFrozenLeft,
  importExceptionGridRowShellClass,
  importExceptionGridTemplate,
  type ImportExceptionGridColumn,
} from './import-exception-grid-layout';

const dataCell = (col: ImportExceptionGridColumn, rule = true) =>
  cn(importExceptionGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/** What was sold — the sheet's title, else the order id it arrived under. */
export function importExceptionLabel(row: ImportExceptionRow): string | null {
  return row.productTitle || row.accountOrderId || null;
}

export const ImportExceptionGridRow = memo(function ImportExceptionGridRow({
  row,
  isSelected,
  onOpenException,
  columns = IMPORT_EXCEPTION_GRID_COLUMNS,
}: {
  row: ImportExceptionRow;
  isSelected: boolean;
  onOpenException: (id: number) => void;
  columns?: readonly ImportExceptionGridColumn[];
}) {
  const label = importExceptionLabel(row);
  const platform = sourcePlatformMetaFromLabel(row.accountSource);

  const renderCell = (col: ImportExceptionGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              importExceptionGridCell({ inset: 'none', rule: true }),
              IMPORT_EXCEPTION_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: importExceptionGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), IMPORT_EXCEPTION_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: importExceptionGridFrozenLeft('title') }}
            data-frozen-edge
          >
            {label ? (
              <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
                {label}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'order':
        return (
          <div data-col="order" className={dataCell(col, rule)}>
            {/* Whole id, not last-8 — see the note on the column model. */}
            <OrderIdChip
              value={row.accountOrderId}
              display={row.accountOrderId}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </div>
        );
      case 'source':
        return (
          <div data-col="source" className={dataCell(col, rule)}>
            <GridPlatformMarkValue platformValue={platform.value} label={platform.label} />
          </div>
        );
      case 'tracking':
        return (
          <div data-col="tracking" className={dataCell(col, rule)}>
            {row.tracking ? (
              <TrackingChip value={row.tracking} showIcon={false} dense />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'sheet':
        return (
          <div data-col="sheet" className={dataCell(col, rule)}>
            {row.sheetRow != null ? (
              <span className="tabular-nums text-role-caption text-text-muted">{row.sheetRow}</span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'seen':
        return (
          <div data-col="seen" className={dataCell(col, rule)}>
            <span className="tabular-nums text-role-caption text-text-muted">{row.seenCount}</span>
          </div>
        );
      case 'first':
        return (
          <div data-col="first" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={formatDateKeyShort(toPSTDateKey(row.firstSeenAt))}
              tooltip={formatDateTimePST(row.firstSeenAt)}
              className="text-role-caption"
            />
          </div>
        );
      case 'last':
        return (
          <div data-col="last" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={formatDateKeyShort(toPSTDateKey(row.lastSeenAt))}
              tooltip={formatDateTimePST(row.lastSeenAt)}
              className="text-role-caption"
            />
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-import-exception-row-id={row.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Missing item number for order ${row.accountOrderId}`}
      onClick={() => onOpenException(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenException(row.id);
        }
      }}
      className={cn(
        importExceptionGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: CATALOG_LINK_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: importExceptionGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
