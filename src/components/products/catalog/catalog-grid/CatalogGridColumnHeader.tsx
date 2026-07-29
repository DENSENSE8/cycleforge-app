'use client';

import { Check } from '@/components/Icons';
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
import { TABLE_FROZEN_HEADER_CLASS } from '@/design-system/tokens/table-surface';
import {
  CATALOG_GRID_COLUMNS,
  CATALOG_GRID_FROZEN_CELL,
  catalogGridCell,
  catalogGridFrozenLeft,
  catalogGridRowShellClass,
  catalogGridTemplate,
  isCatalogGridFrozen,
  isCatalogGridSortable,
  type CatalogGridColumn,
  type CatalogGridColumnKey,
  type CatalogGridSortDir,
} from '@/lib/products/catalog-grid-layout';
import { cn } from '@/utils/_cn';

/**
 * Sticky column header for the catalog LedgerGrid — SoT labels, click-to-sort,
 * select-all over the shared catalog selection scope.
 */
export function CatalogGridColumnHeader({
  selectionScope,
  className,
  columns = CATALOG_GRID_COLUMNS,
  activeSort = null,
  sortDir = null,
  onSortColumn,
}: {
  selectionScope: string;
  className?: string;
  columns?: readonly CatalogGridColumn[];
  activeSort?: CatalogGridColumnKey | null;
  sortDir?: CatalogGridSortDir | null;
  onSortColumn?: (key: CatalogGridColumnKey) => void;
}) {
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const allSelected = Boolean(selectionScope && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectionScope && selectedCount > 0 && !allSelected);

  const template = catalogGridTemplate(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');

  const onToggleAll = () => {
    if (!selectionScope) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  return (
    <div
      role="row"
      className={cn(
        'group/hrow grid min-h-11 border-b border-border-default px-0 py-0',
        TABLE_FROZEN_HEADER_CLASS,
        catalogGridRowShellClass(false, { scrollMinContent: true }),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div
        className={cn(
          catalogGridCell({ inset: 'none', rule: true }),
          'justify-center',
          CATALOG_GRID_FROZEN_CELL,
        )}
        style={{ left: catalogGridFrozenLeft('select') }}
      >
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
      </div>

      {dataColumns.map((column, i) => {
        const last = i === dataColumns.length - 1;
        const sortable = Boolean(onSortColumn) && isCatalogGridSortable(column.key);
        const isActiveSort = activeSort === column.key;
        return (
          <CatalogHeaderCell
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

function CatalogHeaderCell({
  column,
  last,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
}: {
  column: CatalogGridColumn;
  last: boolean;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: CatalogGridSortDir | null;
  onSort?: () => void;
}) {
  const frozen = isCatalogGridFrozen(column.key);

  const glyph = column.type ? (
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
        'group/hcell relative min-h-11 gap-1',
        gridHeaderCellAlignClass(resolveGridColumnAlign(column)),
        catalogGridCell({ rule: !last, inset: 'grid' }),
        frozen && CATALOG_GRID_FROZEN_CELL,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: catalogGridFrozenLeft(column.key) } : undefined}
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
