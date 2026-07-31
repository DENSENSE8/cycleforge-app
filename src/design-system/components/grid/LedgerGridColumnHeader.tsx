'use client';

/**
 * Sticky LedgerGrid column-header row — shared outer chrome for Receiving /
 * Incoming (and later Catalog / Pickup / Repair). Inner label/chevron lives in
 * {@link GridHeaderLabel}; this owns select-all, frozen tracks, sort click,
 * aria-sort, and HoverTooltip tips.
 *
 * Domain wrappers supply a {@link LedgerHeaderLayoutApi} + optional glyph /
 * label overrides. Resize / reorder / Fields menu stay out of v1 (Orders
 * deferred — that fork is a different recipe).
 */

import { type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import { cn } from '@/utils/_cn';
import { GridHeaderLabel, gridHeaderAriaSort } from './GridHeaderLabel';
import { gridHeaderCellAlignClass, resolveGridColumnAlign } from './grid-header-align';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

export type LedgerHeaderSortDir = 'asc' | 'desc';

export type LedgerHeaderLayoutApi<C extends LedgerGridColumnModel> = {
  template: (cols: readonly C[]) => string;
  cellClass: (opts: { inset: 'none' | 'grid'; rule: boolean }) => string;
  rowShellClass: (isMobile: boolean, opts?: { scrollMinContent?: boolean }) => string;
  frozenCellClass: string;
  frozenLeft: (key: string) => string;
  isFrozen: (key: string) => boolean;
  isSortable: (key: string) => boolean;
  /** Column key that draws `data-frozen-edge`. Default `title`. */
  frozenEdgeKey?: string;
};

export type LedgerGridColumnHeaderProps<C extends LedgerGridColumnModel> = {
  columns: readonly C[];
  layout: LedgerHeaderLayoutApi<C>;
  isMobile?: boolean;
  selectMode?: boolean;
  selectionScope?: string;
  className?: string;
  activeSort?: string | null;
  sortDir?: LedgerHeaderSortDir | null;
  onSortColumn?: (key: string) => void;
  /** Surface glyph (e.g. stage Clock, date Calendar). Default: type glyph via GridHeaderLabel. */
  glyphFor?: (column: C) => ReactNode;
  /** Runtime label override (e.g. Unbox stage → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;
};

export function LedgerGridColumnHeader<C extends LedgerGridColumnModel>({
  columns,
  layout,
  isMobile = false,
  selectMode = false,
  selectionScope,
  className,
  activeSort = null,
  sortDir = null,
  onSortColumn,
  glyphFor,
  labelFor,
}: LedgerGridColumnHeaderProps<C>) {
  const scope = selectionScope ?? '__idle__';
  const selectedRows = useTableSelection<{ id?: number | string }>(scope, (r) => Number(r.id));
  const total = useTableSelectionTotal(scope);
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const selectActive = Boolean(selectMode && selectionScope);
  const allSelected = Boolean(selectActive && total > 0 && selectedCount >= total);
  const someSelected = Boolean(selectActive && selectedCount > 0 && !allSelected);

  if (isMobile) return null;

  const template = layout.template(columns);
  const dataColumns = columns.filter((c) => c.key !== 'select');
  const frozenEdgeKey = layout.frozenEdgeKey ?? 'title';

  const onToggleAll = () => {
    if (!selectionScope || !selectActive) return;
    emitToggleAll(selectionScope, allSelected ? 'none' : 'all');
  };

  return (
    <div
      role="row"
      className={cn(
        'group/hrow grid min-h-11 border-b border-border-default bg-surface-card px-0 py-0',
        layout.rowShellClass(false, { scrollMinContent: true }),
        className,
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div
        className={cn(
          layout.cellClass({ inset: 'none', rule: true }),
          'justify-center',
          layout.frozenCellClass,
        )}
        style={{ left: layout.frozenLeft('select') }}
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
        const sortable = Boolean(onSortColumn) && layout.isSortable(column.key);
        const isActiveSort = activeSort === column.key;
        const labelOverride = labelFor?.(column);
        const headerColumn =
          labelOverride != null
            ? ({ ...column, label: labelOverride, gridLabel: labelOverride } as C)
            : column;
        return (
          <LedgerHeaderCell
            key={column.key}
            column={headerColumn}
            last={last}
            layout={layout}
            frozenEdgeKey={frozenEdgeKey}
            sortActive={sortable}
            isActiveSort={isActiveSort}
            sortDir={isActiveSort ? sortDir : null}
            onSort={sortable ? () => onSortColumn?.(column.key) : undefined}
            glyph={glyphFor?.(column)}
          />
        );
      })}
    </div>
  );
}

function LedgerHeaderCell<C extends LedgerGridColumnModel>({
  column,
  last,
  layout,
  frozenEdgeKey,
  sortActive = false,
  isActiveSort = false,
  sortDir = null,
  onSort,
  glyph,
}: {
  column: C;
  last: boolean;
  layout: LedgerHeaderLayoutApi<C>;
  frozenEdgeKey: string;
  sortActive?: boolean;
  isActiveSort?: boolean;
  sortDir?: LedgerHeaderSortDir | null;
  onSort?: () => void;
  glyph?: ReactNode;
}) {
  const frozen = layout.isFrozen(column.key);
  const label = column.label ?? column.key;
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
      data-frozen-edge={column.key === frozenEdgeKey ? true : undefined}
      aria-sort={ariaSort}
      onClick={onSort}
      className={cn(
        'group/hcell relative gap-1 min-h-11',
        gridHeaderCellAlignClass(resolveGridColumnAlign(column)),
        layout.cellClass({ rule: !last, inset: 'grid' }),
        frozen && layout.frozenCellClass,
        tableHeader,
        sortActive && 'cursor-pointer hover:text-text-default',
        isActiveSort && 'text-text-default',
      )}
      style={frozen ? { left: layout.frozenLeft(column.key) } : undefined}
    >
      <GridHeaderLabel column={column} glyph={glyph} sortDir={isActiveSort ? sortDir : null} />
    </div>
  );

  return (
    <HoverTooltip label={tip} focusable={false} asChild>
      {cell}
    </HoverTooltip>
  );
}
