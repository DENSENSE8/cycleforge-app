'use client';

import { ChevronUp, ChevronDown } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  PICKUP_GRID_COLUMNS,
  PICKUP_GRID_FROZEN_CELL,
  isPickupGridFrozen,
  isPickupGridSortable,
  pickupGridCell,
  pickupGridFrozenLeft,
  pickupGridHeaderShowsLabel,
  pickupGridRowShellClass,
  pickupGridTemplate,
  type PickupGridColumn,
  type PickupGridColumnKey,
  type PickupGridSortDir,
} from './pickup-grid-layout';

/**
 * Sticky column header for the Local Pickup LedgerGrid — SoT labels, adaptive
 * glyph + short label, click-to-sort. No select-all control: pickup is a
 * read-only browse surface (no bulk mode), so `select` is a bare gutter that
 * keeps the frozen title aligned with every other station grid.
 */
export function PickupGridColumnHeader({
  columns = PICKUP_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  columns?: readonly PickupGridColumn[];
  activeSort?: PickupGridColumnKey | null;
  sortDir?: PickupGridSortDir | null;
  onSortColumn?: (key: PickupGridColumnKey) => void;
}) {
  const template = pickupGridTemplate(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');

  return (
    <div
      role="row"
      className={cn(
        'grid min-h-11 border-b border-border-default bg-surface-card px-0 py-0',
        pickupGridRowShellClass(false, { scrollMinContent: true }),
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div
        className={cn(
          pickupGridCell({ inset: 'none', rule: true }),
          'justify-center',
          PICKUP_GRID_FROZEN_CELL,
        )}
        style={{ left: pickupGridFrozenLeft('select') }}
        aria-hidden
      />

      {dataColumns.map((column, i) => {
        const last = i === dataColumns.length - 1;
        const sortable = Boolean(onSortColumn) && isPickupGridSortable(column.key);
        return (
          <PickupHeaderCell
            key={column.key}
            column={column}
            last={last}
            sortActive={sortable}
            isActiveSort={activeSort === column.key}
            sortDir={activeSort === column.key ? sortDir : null}
            onSort={sortable ? () => onSortColumn?.(column.key) : undefined}
          />
        );
      })}
    </div>
  );
}

function PickupHeaderCell({
  column,
  last,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
}: {
  column: PickupGridColumn;
  last: boolean;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: PickupGridSortDir | null;
  onSort?: () => void;
}) {
  const label = column.label ?? column.key;
  const showTextLabel = pickupGridHeaderShowsLabel(column);
  const visibleLabel = column.gridLabel ?? label;
  const frozen = isPickupGridFrozen(column.key);
  const alignEnd = column.key === 'price' || column.key === 'qty';

  const glyph = column.type ? (
    <ColumnTypeGlyph type={column.type} className="h-3 w-3 text-text-faint" />
  ) : null;

  const sortChevron =
    isActiveSort && sortDir ? (
      sortDir === 'asc' ? (
        <ChevronUp className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
      ) : (
        <ChevronDown className="h-3 w-3 shrink-0 text-text-muted opacity-80" aria-hidden />
      )
    ) : null;

  const inner = !showTextLabel ? (
    <>
      <span className="sr-only">{label}</span>
      {glyph}
      {sortChevron}
    </>
  ) : (
    <>
      {glyph}
      <span className="min-w-0 truncate">{visibleLabel}</span>
      {sortChevron}
    </>
  );

  const ariaSort =
    isActiveSort && sortDir
      ? sortDir === 'asc'
        ? 'ascending'
        : 'descending'
      : sortActive
        ? 'none'
        : undefined;

  const tip =
    isActiveSort && sortDir
      ? `${label} · sorted ${sortDir === 'asc' ? 'A→Z / ascending' : 'Z→A / descending'}`
      : sortActive
        ? `${label} · click to sort`
        : label;

  const cell = (
    <div
      role="columnheader"
      data-col={column.key}
      data-frozen-edge={column.key === 'title' ? true : undefined}
      aria-sort={ariaSort}
      onClick={onSort}
      className={cn(
        'group/hcell relative gap-1 min-h-11',
        alignEnd ? 'justify-end' : 'justify-start',
        pickupGridCell({ rule: !last, inset: 'grid' }),
        frozen && PICKUP_GRID_FROZEN_CELL,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: pickupGridFrozenLeft(column.key) } : undefined}
    >
      {inner}
    </div>
  );

  return (
    <HoverTooltip label={tip} focusable={false} asChild>
      {cell}
    </HoverTooltip>
  );
}
