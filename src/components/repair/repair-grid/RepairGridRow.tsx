'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { SourceOrderChip, TicketChip, getLast4 } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateCellValue } from '@/components/ui/grid-cells';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  REPAIR_GRID_COLUMNS,
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
  index: number;
  /** The open (detail-panel) record. */
  isSelected: boolean;
  /** In the multi-select checkbox set. */
  isChecked: boolean;
  onOpen: (repair: RSRecord) => void;
  onToggleSelect: (repair: RSRecord, event: { shiftKey: boolean }) => void;
  columns?: readonly RepairGridColumn[];
}

/**
 * Repair queue leaf row — CSS-grid columns matching {@link REPAIR_GRID_COLUMNS}.
 * Airtable skin: always-on left checkbox (toggles selection, stops propagation);
 * the row body opens the detail panel. Twin of `IncomingGridRow`, mapped to the
 * repair-ticket facts.
 */
export const RepairGridRow = memo(function RepairGridRow({
  repair,
  index,
  isSelected,
  isChecked,
  onOpen,
  onToggleSelect,
  columns = REPAIR_GRID_COLUMNS,
}: RepairGridRowProps) {
  const productTitle = repair.product_title || 'Unknown Product';
  const issue = String(repair.issue || '').trim();
  const createdCell = repairDateCell(repairCreatedAtSource(repair));
  const customer = repairCustomerName(repair);
  const phone = repairPhoneDisplay(repair);
  const priceDisplay = repairPriceDisplay(repair);
  const orderValue = repairOrderValue(repair);
  const ticketValue = repairTicketValue(repair);

  const dataCell = (rule = true) => repairGridCell({ rule, inset: 'grid' });

  const renderCell = (col: RepairGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              repairGridCell({ inset: 'none', rule: true }),
              REPAIR_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: repairGridFrozenLeft('select') }}
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
            className={cn(dataCell(rule), REPAIR_GRID_FROZEN_CELL, 'relative min-w-0')}
            style={{ left: repairGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <div className="flex min-w-0 flex-col">
              <span className="min-w-0 truncate text-role-data text-text-default">{productTitle}</span>
              {issue ? (
                <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-wide text-text-muted">
                  {issue}
                </span>
              ) : null}
            </div>
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(rule)}>
            <GridDateCellValue
              label={createdCell?.label}
              tooltip={createdCell?.tooltip}
              className="text-role-caption"
            />
          </div>
        );
      case 'customer':
        return (
          <div data-col="customer" className={dataCell(rule)}>
            {customer ? (
              <span className="min-w-0 truncate text-role-caption text-text-default">{customer}</span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'phone':
        return (
          <div data-col="phone" className={dataCell(rule)}>
            {phone ? (
              <span className="min-w-0 truncate tabular-nums text-role-caption text-text-muted">
                {phone}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'price':
        return (
          <div data-col="price" className={cn(dataCell(rule), 'justify-end')}>
            {priceDisplay ? (
              <span className="min-w-0 truncate tabular-nums text-role-caption font-semibold text-emerald-600">
                {priceDisplay}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'order':
        // Linked online order → `#`+last-4 copy chip; local/walk-in repairs
        // (no source order) read as a type label, not a broken order number.
        return (
          <div data-col="order" className={dataCell(rule)}>
            {orderValue ? (
              <SourceOrderChip value={orderValue} display={getLast4(orderValue)} />
            ) : (
              <span className="min-w-0 truncate text-role-caption font-semibold text-text-muted">
                Walk-in
              </span>
            )}
          </div>
        );
      case 'ticket':
        return (
          <div data-col="ticket" className={dataCell(rule)}>
            {ticketValue ? (
              <TicketChip value={ticketValue} display={getLast4(ticketValue)} />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      default:
        return <span className={dataCell(rule)} />;
    }
  };

  return (
    <div
      data-order-row-id={String(repair.id)}
      data-repair-row-id={String(repair.id)}
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
        'cursor-pointer border-b border-border-hairline px-0 py-0 transition-colors hover:bg-surface-hover',
        isSelected || isChecked
          ? QUEUE_ROW.selectedClass
          : index % 2 === 1
            ? 'bg-surface-canvas'
            : 'bg-surface-card',
      )}
      style={{ gridTemplateColumns: repairGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
