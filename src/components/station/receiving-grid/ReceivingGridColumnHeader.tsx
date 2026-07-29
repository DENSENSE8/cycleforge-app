'use client';

import { Check, ChevronUp, ChevronDown, Clock } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import { gridHeaderCellAlignClass } from '@/design-system/components/grid/grid-header-align';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridCell,
  receivingGridFrozenLeft,
  receivingGridHeaderShowsLabel,
  receivingGridRowShellClass,
  receivingGridTemplate,
  isReceivingGridFrozen,
  isReceivingGridSortable,
  type ReceivingGridColumn,
  type ReceivingGridColumnKey,
  type ReceivingGridSortDir,
} from '@/lib/receiving/receiving-grid-layout';
import { cn } from '@/utils/_cn';

/**
 * Sticky column header for Unbox / History / Testing LedgerGrid — SoT labels,
 * adaptive glyph + short label, click-to-sort, select-all when selectMode is armed.
 *
 * `columns` arrives ALREADY RESOLVED by `useGridColumnVisibility` in
 * `ReceivingGridView` — a column a staffer turned off is absent from the list,
 * so its track never exists. This header does not re-ask "is it hidden?";
 * doing so is what used to leave a dead empty ruled band where the column was.
 */
export function ReceivingGridColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  columns = RECEIVING_GRID_COLUMNS,
  /** Overrides the `stage` column header label (Unboxed / Scanned / Tested). */
  stageLabel = 'Stage',
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  className?: string;
  columns?: readonly ReceivingGridColumn[];
  stageLabel?: string;
  activeSort?: ReceivingGridColumnKey | null;
  sortDir?: ReceivingGridSortDir | null;
  onSortColumn?: (key: ReceivingGridColumnKey) => void;
}) {
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const selectActive = Boolean(selectMode && selectionScope);
  const allSelected = Boolean(selectActive && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectActive && selectedCount > 0 && !allSelected);

  if (isMobile) return null;

  const template = receivingGridTemplate(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  return (
    <div
      role="row"
      className={cn(
        'group/hrow grid min-h-11 border-b border-border-default bg-surface-card px-0 py-0',
        receivingGridRowShellClass(false, { scrollMinContent: true }),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div
        className={cn(
          receivingGridCell({ inset: 'none', rule: true }),
          'justify-center',
          RECEIVING_GRID_FROZEN_CELL,
        )}
        style={{ left: receivingGridFrozenLeft('select') }}
      >
        {selectActive ? (
          <button
            type="button"
            onClick={onToggleAll}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
            aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
            role="checkbox"
            className={cn(
              'ds-raw-button flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              allSelected
                ? 'border-accent-bg bg-accent-bg text-text-inverse'
                : someSelected
                  ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
                  : 'border-border-default bg-surface-card hover:border-border-strong',
            )}
          >
            {allSelected ? (
              <Check className="h-3 w-3" />
            ) : someSelected ? (
              <span className="h-0.5 w-2 rounded-full bg-current" />
            ) : null}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>

      {dataColumns.map((column, i) => {
        const last = i === dataColumns.length - 1;
        const sortable = Boolean(onSortColumn) && isReceivingGridSortable(column.key);
        const isActiveSort = activeSort === column.key;
        const headerColumn =
          column.key === 'stage' ? { ...column, label: stageLabel, gridLabel: stageLabel } : column;
        return (
          <ReceivingHeaderCell
            key={column.key}
            column={headerColumn}
            last={last}
            sortActive={sortable}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortable ? () => onSortColumn?.(column.key) : undefined}
          />
        );
      })}
    </div>
  );
}

function ReceivingHeaderCell({
  column,
  last,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
}: {
  column: ReceivingGridColumn;
  last: boolean;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: ReceivingGridSortDir | null;
  onSort?: () => void;
}) {
  const label = column.label ?? column.key;
  const showTextLabel = receivingGridHeaderShowsLabel(column);
  const visibleLabel = column.gridLabel ?? label;
  const frozen = isReceivingGridFrozen(column.key);

  const glyph =
    column.key === 'stage' ? (
      <Clock className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.type ? (
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
        // `qty` cells are right-aligned (ReceivingGridRow) — the header follows.
        gridHeaderCellAlignClass(column.key === 'qty' ? 'end' : 'start'),
        receivingGridCell({ rule: !last, inset: 'grid' }),
        frozen && RECEIVING_GRID_FROZEN_CELL,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: receivingGridFrozenLeft(column.key) } : undefined}
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
