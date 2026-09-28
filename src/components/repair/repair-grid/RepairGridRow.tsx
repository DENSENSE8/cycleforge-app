'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { SourceOrderChip, TicketChip, getLast8 } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateCellValue } from '@/components/ui/grid-cells';
import { resolveRepairSlotValue } from '@/lib/tables/field-catalog/repair-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { REPAIR_GRID_CAPABILITIES } from '@/components/repair/repair-grid/repair-grid-descriptor';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  REPAIR_GRID_FROZEN_CELL,
  repairCreatedAtSource,
  repairCustomerName,
  repairGridCell,
  repairGridFrozenLeft,
  repairGridRowShellClass,
  repairGridTemplate,
  repairOrderValue,
  repairPhoneDisplay,
  repairPriceDisplay,
  repairTicketValue,
  type RepairGridColumn,
} from '@/lib/repair/repair-grid-layout';
import { formatDateKeyMedium, formatDateKeyShort, toPSTDateKey } from '@/utils/date';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { cn } from '@/utils/_cn';

/** Compact civil-day cell for the Created column (label + full-day tooltip). */
function repairDateCell(source: string | null | undefined): { label: string; tooltip: string } | null {
  if (!source) return null;
  const key = toPSTDateKey(source);
  if (!key || key === 'Unknown') return null;
  const when = formatDateKeyMedium(key, { weekday: 'short', withYear: true });
  return { label: formatDateKeyShort(key), tooltip: `Created · ${when}` };
}

interface RepairGridRowProps {
  repair: RSRecord;
  /** The open (detail-panel) record. */
  isSelected: boolean;
  /** In the multi-select checkbox set. */
  isChecked: boolean;
  onOpen: (repair: RSRecord) => void;
  onToggleSelect: (repair: RSRecord, event: { shiftKey: boolean }) => void;
  columns: readonly RepairGridColumn[];
}

/**
 * Repair queue leaf row — CSS-grid columns matching {@link REPAIR_GRID_COLUMNS}.
 * Airtable skin: always-on left checkbox (toggles selection, stops propagation);
 * the row body opens the detail panel, mapped to the repair-ticket facts.
 */
export const RepairGridRow = memo(function RepairGridRow({
  repair,
  isSelected,
  isChecked,
  onOpen,
  onToggleSelect,
  columns,
}: RepairGridRowProps) {
  const productTitle = repair.product_title || 'Unknown Product';
  const issue = String(repair.issue || '').trim();
  const createdCell = repairDateCell(repairCreatedAtSource(repair));
  const customer = repairCustomerName(repair);
  const phone = repairPhoneDisplay(repair);
  const priceDisplay = repairPriceDisplay(repair);
  const orderValue = repairOrderValue(repair);
  const ticketValue = repairTicketValue(repair);

  const dataCell = (col: RepairGridColumn, rule = true) =>
    cn(repairGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

  /** The body of one materialized slot track, chosen by the BOUND FIELD. */
  const renderSlotBody = (fieldId: string | undefined): ReactNode => {
    switch (fieldId) {
      case 'repair.created':
        return (
          <GridDateCellValue
            label={createdCell?.label}
            tooltip={createdCell?.tooltip}
            className="text-role-caption"
          />
        );
      case 'repair.customer':
        return customer ? (
          <span className="min-w-0 truncate text-role-caption text-text-default">{customer}</span>
        ) : (
          <GridCellDash />
        );
      case 'repair.phone':
        return phone ? (
          <span className="min-w-0 truncate tabular-nums text-role-caption text-text-muted">
            {phone}
          </span>
        ) : (
          <GridCellDash />
        );
      case 'repair.price':
        return priceDisplay ? (
          <span className="min-w-0 truncate tabular-nums text-role-caption font-semibold text-emerald-600">
            {priceDisplay}
          </span>
        ) : (
          <GridCellDash />
        );
      case 'repair.order':
        // Linked online order → `#`+last-8 copy chip; local/walk-in repairs
        // (no source order) read as a type label, not a broken order number.
        return orderValue ? (
          <SourceOrderChip value={orderValue} display={getLast8(orderValue)} />
        ) : (
          <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
            Walk-in
          </span>
        );
      case 'repair.ticket':
        return ticketValue ? (
          <TicketChip value={ticketValue} display={getLast8(ticketValue)} />
        ) : (
          <GridCellDash />
        );
      default: {
        // A catalog field with no bespoke face paints its resolved text — a new
        // bindable fact needs a resolver case, never a new column file.
        const value = fieldId ? resolveRepairSlotValue(repair, fieldId) : null;
        const text = value?.kind === 'value' ? value.text : null;
        return text ? (
          <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
        ) : (
          <GridCellDash />
        );
      }
    }
  };

  const renderCell = (col: RepairGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    if (isSlotTrackKey(col.key)) {
      return (
        <div data-col={col.key} className={dataCell(col, rule)}>
          {renderSlotBody(col.fieldId)}
        </div>
      );
    }
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              repairGridCell({ inset: 'none', rule: true }),
              REPAIR_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: repairGridFrozenLeft(columns, 'select') }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={isChecked}
              aria-label={isChecked ? 'Deselect repair' : 'Select repair'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(repair, { shiftKey: e.shiftKey });
              }}
              className={cn(
                'ds-raw-button flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                isChecked
                  ? 'border-accent-bg bg-accent-bg text-text-inverse'
                  : 'border-border-default bg-surface-card',
              )}
            >
              {isChecked ? <Check className="h-3 w-3" /> : null}
            </button>
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), REPAIR_GRID_FROZEN_CELL, 'relative min-w-0')}
            style={{ left: repairGridFrozenLeft(columns, 'title') }}
            data-frozen-edge
          >
            <div className="flex min-w-0 flex-col">
              <span className="min-w-0 truncate text-role-data text-text-default">{productTitle}</span>
              {issue ? (
                <span className="min-w-0 truncate text-role-eyebrow text-text-muted">
                  {issue}
                </span>
              ) : null}
            </div>
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-order-row-id={String(repair.id)}
      data-repair-row-id={String(repair.id)}
      data-desk-record-key={String(repair.id)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Open repair details for ${productTitle}`}
      onClick={() => onOpen(repair)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(repair);
        }
      }}
      className={cn(
        repairGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected || isChecked,
          capabilities: REPAIR_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: repairGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
