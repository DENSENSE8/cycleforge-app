'use client';

import { Check, Calendar, Clock } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { ColumnTypeGlyph } from '@/components/ui/table-column-config/column-type-glyph';
import {
  GridHeaderLabel,
  gridHeaderAriaSort,
} from '@/design-system/components/grid/GridHeaderLabel';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from '@/design-system/components/grid/grid-header-align';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  INCOMING_GRID_COLUMNS,
  INCOMING_GRID_FROZEN_CELL,
  incomingGridCell,
  incomingGridFrozenLeft,
  incomingGridRowShellClass,
  incomingGridTemplate,
  isIncomingGridFrozen,
  isIncomingGridSortable,
  type IncomingGridColumn,
  type IncomingGridColumnKey,
  type IncomingGridSortDir,
} from '@/lib/receiving/incoming-grid-layout';
import { cn } from '@/utils/_cn';

/**
 * Sticky column header for the Incoming LedgerGrid — SoT labels (Product Title),
 * adaptive glyph + short label, click-to-sort (Pending spreadsheet contract),
 * select-all when selectMode is armed.
 *
 * `columns` arrives ALREADY RESOLVED by `useGridColumnVisibility` in
 * `IncomingGridView` — a column a staffer turned off is absent from the list,
 * so its track never exists. This header does not re-ask "is it hidden?";
 * doing so is what used to leave a dead empty ruled band where the column was.
 */
export function IncomingGridColumnHeader({
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  columns = INCOMING_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  className?: string;
  columns?: readonly IncomingGridColumn[];
  activeSort?: IncomingGridColumnKey | null;
  sortDir?: IncomingGridSortDir | null;
  onSortColumn?: (key: IncomingGridColumnKey) => void;
}) {
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const selectActive = Boolean(selectMode && selectionScope);
  const allSelected = Boolean(selectActive && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectActive && selectedCount > 0 && !allSelected);

  if (isMobile) return null;

  const template = incomingGridTemplate(columns);
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
        incomingGridRowShellClass(false, { scrollMinContent: true }),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div
        className={cn(
          incomingGridCell({ inset: 'none', rule: true }),
          'justify-center',
          INCOMING_GRID_FROZEN_CELL,
        )}
        style={{ left: incomingGridFrozenLeft('select') }}
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
        const sortable = Boolean(onSortColumn) && isIncomingGridSortable(column.key);
        const isActiveSort = activeSort === column.key;
        return (
          <IncomingHeaderCell
            key={column.key}
            column={column}
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

function IncomingHeaderCell({
  column,
  last,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
}: {
  column: IncomingGridColumn;
  last: boolean;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: IncomingGridSortDir | null;
  onSort?: () => void;
}) {
  const frozen = isIncomingGridFrozen(column.key);

  const glyph =
    column.key === 'date' ? (
      <Calendar className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.key === 'age' ? (
      <Clock className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
    ) : column.type ? (
      <ColumnTypeGlyph type={column.type} className="h-3 w-3 text-text-faint" />
    ) : null;

  // Tooltip copy only — the visible label is resolved inside GridHeaderLabel.
  const label = column.label ?? column.key;

  const inner = (
    <GridHeaderLabel column={column} glyph={glyph} sortDir={isActiveSort ? sortDir : null} />
  );

  const ariaSort = gridHeaderAriaSort(isActiveSort, sortDir, sortActive);

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
        // `qty` cells are right-aligned (IncomingGridRow) — the header follows.
        gridHeaderCellAlignClass(resolveGridColumnAlign(column)),
        incomingGridCell({ rule: !last, inset: 'grid' }),
        frozen && INCOMING_GRID_FROZEN_CELL,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: incomingGridFrozenLeft(column.key) } : undefined}
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
