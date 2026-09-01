'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Pencil, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateTimeCellValue, GridStatusCellValue } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { resolveTrackingExceptionSlotValue } from '@/lib/tables/field-catalog/tracking-exceptions-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { cn } from '@/utils/_cn';
import {
  trackingExceptionCarrier,
  trackingExceptionStaffLabel,
  type TrackingExceptionRow,
} from '../types';
import { TRACKING_EXCEPTIONS_GRID_CAPABILITIES } from './tracking-exceptions-grid-descriptor';
import {
  TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
  trackingExceptionsGridCell,
  trackingExceptionsGridFrozenLeft,
  trackingExceptionsGridRowShellClass,
  trackingExceptionsGridTemplate,
  type TrackingExceptionsGridColumn,
} from './tracking-exceptions-grid-layout';

const dataCell = (col: TrackingExceptionsGridColumn, rule = true) =>
  cn(trackingExceptionsGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/** Tone map for house {@link GridStatusCellValue} — bg + text only; ring from the cell. */
const STATUS_TONE: Record<TrackingExceptionRow['status'], string> = {
  open: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  discarded: 'bg-surface-sunken text-text-muted',
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
  columns,
}: {
  row: TrackingExceptionRow;
  isSelected: boolean;
  refreshing: boolean;
  onOpenEdit: (row: TrackingExceptionRow) => void;
  onRefresh: (row: TrackingExceptionRow) => void;
  columns: readonly TrackingExceptionsGridColumn[];
}) {
  const staff = trackingExceptionStaffLabel(row);
  const carrier = trackingExceptionCarrier(row);

  /** The body of one materialized slot track, chosen by the BOUND FIELD. */
  const renderSlotBody = (fieldId: string | undefined): ReactNode => {
    switch (fieldId) {
      case 'tracking-exceptions.carrier':
        return (
          <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
            {carrier}
          </span>
        );
      case 'tracking-exceptions.reason':
        return (
          <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
            {row.exception_reason}
          </span>
        );
      case 'tracking-exceptions.status':
        return <GridStatusCellValue label={row.status} toneClass={STATUS_TONE[row.status]} />;
      case 'tracking-exceptions.retries':
        return (
          <span className="font-mono text-role-caption text-text-muted">
            {row.zoho_check_count}
          </span>
        );
      case 'tracking-exceptions.last_check':
        return row.last_zoho_check_at ? (
          <GridDateTimeCellValue
            raw={row.last_zoho_check_at}
            className="text-role-caption text-text-muted"
          />
        ) : (
          <GridCellDash />
        );
      case 'tracking-exceptions.created':
        return (
          <GridDateTimeCellValue
            raw={row.created_at}
            className="text-role-caption text-text-muted"
          />
        );
      case 'tracking-exceptions.notes':
        return row.notes ? (
          <HoverTooltip label={row.notes} focusable={false}>
            <span className="min-w-0 truncate text-role-caption text-text-muted">{row.notes}</span>
          </HoverTooltip>
        ) : (
          <GridCellDash />
        );
      default: {
        // A catalog field with no bespoke face paints its resolved text — a new
        // bindable fact needs a resolver case, never a new column file.
        const value = fieldId ? resolveTrackingExceptionSlotValue(row, fieldId) : null;
        const text = value?.kind === 'value' ? value.text : null;
        return text ? (
          <span className="min-w-0 truncate text-role-caption text-text-muted">{text}</span>
        ) : (
          <GridCellDash />
        );
      }
    }
  };

  const renderCell = (col: TrackingExceptionsGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    if (isSlotTrackKey(col.key)) {
      return (
        <div data-col={col.key} className={cn(dataCell(col, rule), 'min-w-0')}>
          {renderSlotBody(col.fieldId)}
        </div>
      );
    }
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              trackingExceptionsGridCell({ inset: 'none', rule: true }),
              TRACKING_EXCEPTIONS_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: trackingExceptionsGridFrozenLeft(columns, 'select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), TRACKING_EXCEPTIONS_GRID_FROZEN_CELL)}
            style={{ left: trackingExceptionsGridFrozenLeft(columns, 'title') }}
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
