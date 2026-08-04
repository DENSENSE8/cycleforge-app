'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Pencil, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateTimeCellValue } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { cn } from '@/utils/_cn';
import {
  trackingExceptionCarrier,
  trackingExceptionStaffLabel,
  type TrackingExceptionRow,
} from '../types';
import { TRACKING_EXCEPTIONS_GRID_CAPABILITIES } from './tracking-exceptions-grid-descriptor';
import {
  TRACKING_EXCEPTIONS_GRID_COLUMNS,
  TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
  trackingExceptionsGridCell,
  trackingExceptionsGridFrozenLeft,
  trackingExceptionsGridRowShellClass,
  trackingExceptionsGridTemplate,
  type TrackingExceptionsGridColumn,
} from './tracking-exceptions-grid-layout';

const dataCell = (col: TrackingExceptionsGridColumn, rule = true) =>
  cn(trackingExceptionsGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

const STATUS_PILL: Record<TrackingExceptionRow['status'], string> = {
  open: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  discarded: 'bg-surface-sunken text-text-muted ring-1 ring-border-soft',
};

/**
 * One tracking exception — CSS-grid columns matching
 * {@link TRACKING_EXCEPTIONS_GRID_COLUMNS}.
 *
 * Row click opens the record plane (edit dialog). Refresh / Edit buttons are
 * row-scoped and stop propagation so Refresh never also opens the dialog.
 */
export const TrackingExceptionsGridRow = memo(function TrackingExceptionsGridRow({
  row,
  isSelected,
  refreshing,
  onOpenEdit,
  onRefresh,
  columns = TRACKING_EXCEPTIONS_GRID_COLUMNS,
}: {
  row: TrackingExceptionRow;
  isSelected: boolean;
  refreshing: boolean;
  onOpenEdit: (row: TrackingExceptionRow) => void;
  onRefresh: (row: TrackingExceptionRow) => void;
  columns?: readonly TrackingExceptionsGridColumn[];
}) {
  const staff = trackingExceptionStaffLabel(row);
  const carrier = trackingExceptionCarrier(row);

  const renderCell = (col: TrackingExceptionsGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              trackingExceptionsGridCell({ inset: 'none', rule: true }),
              TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: trackingExceptionsGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), TRACKING_EXCEPTIONS_GRID_FROZEN_CELL)}
            style={{ left: trackingExceptionsGridFrozenLeft('title') }}
            data-frozen-edge
          >
            {/* TrackingChip stopPropagates its own copy click — the cell itself
                must still open the record plane (title is the flexing track, so
                the row's geometric center usually lands here). */}
            <TrackingChip
              value={row.tracking_number}
              display={getLast8(row.tracking_number) || row.tracking_number.slice(-8)}
            />
          </div>
        );
      case 'carrier':
        return (
          <div data-col="carrier" className={dataCell(col, rule)}>
            <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
              {carrier}
            </span>
          </div>
        );
      case 'source':
        return (
          <div data-col="source" className={dataCell(col, rule)}>
            {row.source_station ? (
              <span className="min-w-0 truncate text-role-caption text-text-muted">
                {row.source_station}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'staff':
        return (
          <div data-col="staff" className={dataCell(col, rule)}>
            {staff ? (
              <span className="min-w-0 truncate text-role-caption text-text-muted">{staff}</span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'reason':
        return (
          <div data-col="reason" className={dataCell(col, rule)}>
            <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
              {row.exception_reason}
            </span>
          </div>
        );
      case 'status':
        return (
          <div data-col="status" className={dataCell(col, rule)}>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-role-eyebrow uppercase tracking-widest',
                STATUS_PILL[row.status],
              )}
            >
              {row.status}
            </span>
          </div>
        );
      case 'retries':
        return (
          <div data-col="retries" className={dataCell(col, rule)}>
            <span className="font-mono text-role-caption text-text-muted">
              {row.zoho_check_count}
            </span>
          </div>
        );
      case 'lastCheck':
        return (
          <div data-col="lastCheck" className={dataCell(col, rule)}>
            {row.last_zoho_check_at ? (
              <GridDateTimeCellValue
                raw={row.last_zoho_check_at}
                className="text-role-caption text-text-muted"
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'created':
        return (
          <div data-col="created" className={dataCell(col, rule)}>
            <GridDateTimeCellValue
              raw={row.created_at}
              className="text-role-caption text-text-muted"
            />
          </div>
        );
      case 'notes':
        return (
          <div data-col="notes" className={cn(dataCell(col, rule), 'min-w-0')}>
            {row.notes ? (
              <HoverTooltip label={row.notes} focusable={false}>
                <span className="min-w-0 truncate text-role-caption text-text-muted">
                  {row.notes}
                </span>
              </HoverTooltip>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'actions':
        return (
          <div
            data-col="actions"
            className={cn(
              dataCell(col, rule),
              'min-w-0 justify-center gap-1',
              // Quiet secondary chrome — reveal on row hover/focus (or while
              // refresh is in flight / row selected). Same family as Orders
              // queue row actions + empty-field paste.
              refreshing || isSelected
                ? 'opacity-100'
                : cn(
                    'opacity-0 pointer-events-none',
                    'group-hover/tx-row:pointer-events-auto group-hover/tx-row:opacity-100',
                    'group-focus-within/tx-row:pointer-events-auto group-focus-within/tx-row:opacity-100',
                  ),
            )}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <HoverTooltip
              label={
                row.status === 'open'
                  ? 'Refresh: re-query Zoho with this tracking number'
                  : 'Only open exceptions can be refreshed'
              }
              asChild
            >
              {/* ds-raw-button: HoverTooltip asChild clones a ref onto the child for positioning; IconButton is a plain fn component (no forwardRef), so the tooltip would stop showing. */}
              <button
                type="button"
                onClick={() => onRefresh(row)}
                disabled={refreshing || row.status !== 'open'}
                aria-label="Refresh from Zoho"
                className="rounded-md p-1.5 text-text-soft transition-opacity hover:bg-blue-50 hover:text-blue-700 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </button>
            </HoverTooltip>
            <HoverTooltip label="Edit — opens a dialog where you can update or delete this row" asChild>
              {/* ds-raw-button: HoverTooltip asChild clones a ref onto the child for positioning; IconButton is a plain fn component (no forwardRef), so the tooltip would stop showing. */}
              <button
                type="button"
                onClick={() => onOpenEdit(row)}
                aria-label="Edit exception"
                className="rounded-md p-1.5 text-text-soft transition-opacity hover:bg-surface-sunken hover:text-text-default focus-visible:opacity-100"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </HoverTooltip>
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-tracking-exception-row-id={row.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Tracking exception ${row.tracking_number}`}
      onClick={() => onOpenEdit(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenEdit(row);
        }
      }}
      className={cn(
        'group/tx-row',
        trackingExceptionsGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: TRACKING_EXCEPTIONS_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: trackingExceptionsGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
