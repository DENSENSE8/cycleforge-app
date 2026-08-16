/**
 * Derive a family's grid LAYOUT from its column model.
 *
 * ## The duplication this collapses
 *
 * Sixteen families each ship a `*-grid-layout.ts` — ~2,500 lines between them —
 * and reading one end to end shows there is almost nothing in it. Warranty's
 * eight exports break down as:
 *
 * | export | what it actually is |
 * |---|---|
 * | `warrantyGridCell` · `warrantyGridRowShellClass` · `WARRANTY_GRID_FROZEN_CELL` | literal re-exports of DS symbols under a family-prefixed name |
 * | `warrantyGridTemplate(cols)` | `gridTemplate(cols)` |
 * | `warrantyGridFrozenLeft(key)` | `gridFrozenLeft(WARRANTY_GRID_COLUMNS, key)` — closing over an array the binding already holds |
 * | `isWarrantyGridSortable` | `columns.filter(c => c.sortable !== false && c.key !== 'select')` |
 * | `isWarrantyGridFrozen` | `gridFrozenKeys(columns)` — already the SoT |
 * | `defaultDirForWarrantyGridSort` | **the only real per-family knowledge**, and it is one boolean per column |
 *
 * Ready's module is the same file with the names swapped. So the column model
 * — which the binding already carries — is the whole input; everything above is
 * a function of it, and the alias layer exists because each family was written
 * by copying the last one.
 *
 * ## What this does NOT take over
 *
 * The **column model** itself, and the family's **cells**. Those genuinely
 * differ per family and collapsing them would be the Airtable mega-row the
 * engine plan killed. This owns the mechanical derivation, not the domain.
 *
 * ## `descFirstKeys` is data, not code
 *
 * The one thing a family knew that its columns did not: which column reads
 * newest/most-urgent first on its first click. Warranty's `warranty` column is
 * the interesting case — it holds days REMAINING, so it stays **ascending** on
 * purpose (fewest days left first is the only reason to sort it). Naming the
 * desc-first keys makes that a one-line declaration instead of a function.
 */

import { gridFrozenKeys } from './grid-column-editability';
import { gridFrozenLeft, gridTemplate } from './grid-column-geometry';
import {
  LEDGER_GRID_FROZEN_CELL,
  ledgerGridCell,
  ledgerGridRowShellClass,
} from './grid-cell-chrome';
import type { GridSortDir } from './grid-sort-dir';
import type { LedgerHeaderLayoutApi } from './LedgerGridColumnHeader';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

/**
 * `sortable` is declared on each family's own column interface and NOT on the
 * DS base model, so the derivation widens rather than assuming it. The base
 * model's own descriptor already applies the same `key !== 'select'` exclusion
 * (`makeGridSurfaceDescriptor`) — this keeps the two answers in step.
 */
type SortableColumnModel = LedgerGridColumnModel & { sortable?: boolean };

interface GridLayoutSpec<C extends SortableColumnModel> {
  /** The family's FULL canonical column model. */
  columns: readonly C[];
  /**
   * Keys whose FIRST sort activation runs descending — dates, and anything
   * whose useful end is the high one. Everything else opens ascending.
   */
  descFirstKeys?: readonly string[];
  /** Column key that draws `data-frozen-edge`. Defaults to `title`. */
  frozenEdgeKey?: string;
}

interface DerivedGridLayout<C extends SortableColumnModel> {
  /** Ready to hand to `makeLedgerGridColumnHeader({ layout })`. */
  readonly layout: LedgerHeaderLayoutApi<C>;
  /** `grid-template-columns` for a resolved (post-visibility) column list. */
  template(columns?: readonly C[]): string;
  /** Sticky offset for a frozen cell, summed over the FULL model. */
  frozenLeft(key: string): string;
  isFrozen(key: string): boolean;
  isSortable(key: string): boolean;
  defaultDir(key: string): GridSortDir;
}

/**
 * Build the derived layout once, at module scope, beside the column model.
 *
 * Call this at module level and export the result — never inside a component.
 * `LedgerGridSurface` memoizes on identity, so a fresh object per render would
 * rebuild the state engine's column list every render (same reason
 * `makeDescriptor` is a module-level reference on the binding).
 */
export function makeGridLayout<C extends SortableColumnModel>(
  spec: GridLayoutSpec<C>,
): DerivedGridLayout<C> {
  const { columns, descFirstKeys = [], frozenEdgeKey } = spec;

  const lockedKeys: readonly string[] = gridFrozenKeys(columns);
  // `select` is the gutter, never a sort target — the one key excluded by
  // position rather than by its own `sortable` flag.
  const sortableKeys: readonly string[] = columns
    .filter((c) => c.sortable !== false && c.key !== 'select')
    .map((c) => c.key);
  const descFirst = new Set(descFirstKeys);

  const isFrozen = (key: string): boolean => lockedKeys.includes(key);
  const isSortable = (key: string): boolean => sortableKeys.includes(key);
  const template = (cols: readonly C[] = columns): string => gridTemplate(cols);
  const frozenLeft = (key: string): string => gridFrozenLeft(columns, key);

  return {
    layout: {
      template,
      cellClass: ledgerGridCell,
      rowShellClass: ledgerGridRowShellClass,
      frozenCellClass: LEDGER_GRID_FROZEN_CELL,
      frozenLeft,
      isFrozen,
      isSortable,
      ...(frozenEdgeKey ? { frozenEdgeKey } : {}),
    },
    template,
    frozenLeft,
    isFrozen,
    isSortable,
    defaultDir: (key) => (descFirst.has(key) ? 'desc' : 'asc'),
  };
}
