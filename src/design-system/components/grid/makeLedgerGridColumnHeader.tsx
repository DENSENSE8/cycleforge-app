'use client';

/**
 * `makeLedgerGridColumnHeader` — the factory every LedgerGrid family's sticky
 * column header is built from.
 *
 * ## Why this exists
 *
 * Each of the twelve grid families shipped its own `<Family>GridColumnHeader.tsx`:
 * ~65 lines that built a {@link LedgerHeaderLayoutApi} out of its layout
 * module's exports, re-declared the same six props, and forwarded them with
 * `as`-casts. Across the pin that was ~900 lines in which the only real
 * variation was *which layout object*, *whether select-all is on*, and an
 * optional glyph/label override.
 *
 * Copy-paste of that size is not free: it is where a family silently ships
 * without `onResizeColumn` wired, or forwards `activeSort` but forgets
 * `sortDir`. The factory makes the correct wiring the only wiring — a family
 * declares its layout and gets a header it cannot mis-forward.
 *
 * ## What stays per family
 *
 * The **column model** and its key vocabulary. Those genuinely differ, and
 * collapsing them would be the fork `pattern-evolution.md` bans. This factory
 * owns the *plumbing*, not the columns.
 *
 * ## Select-all is a MODE, not a boolean
 *
 * `selectMode` in the config is one of three answers, and the choice changes
 * the generated component's prop TYPES:
 *
 * | mode | means | props |
 * |---|---|---|
 * | `'always'` | the surface is always multi-select (Catalog · Repair · Bins) | `selectionScope` is **required** |
 * | `'prop'` | the caller decides per mount (Receiving · Incoming) | `selectMode` + `selectionScope` optional |
 * | `'never'` | read-only browse; the `select` gutter is a spacer | neither prop exists |
 *
 * `'always'` requiring the scope is the point: select-all needs a selection
 * scope to talk to, so a header that renders the checkbox without one is a
 * checkbox that does nothing. Making it a required prop turns that into a
 * compile error instead of a dead control. `'never'` forbidding both is the
 * mirror — passing a scope to a surface whose descriptor declares
 * `multiSelect: false` is a contradiction worth failing on.
 *
 * @example
 * export const WarrantyGridColumnHeader = makeLedgerGridColumnHeader<
 *   WarrantyGridColumn,
 *   WarrantyGridColumnKey
 * >({ layout: WARRANTY_HEADER_LAYOUT, defaultColumns: WARRANTY_GRID_COLUMNS });
 */

import type { ReactElement, ReactNode } from 'react';
import {
  LedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from './LedgerGridColumnHeader';
import type { GridSortDir } from './grid-sort-dir';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

/** How this surface answers "may an operator select rows here?". */
export type GridHeaderSelectMode = 'always' | 'prop' | 'never';

/** Props shared by every generated header, whatever its select mode. */
export interface GridColumnHeaderBaseProps<
  C extends LedgerGridColumnModel,
  K extends string,
> {
  /** Visibility-RESOLVED columns. Defaults to the family's full model. */
  columns?: readonly C[];
  className?: string;
  isMobile?: boolean;
  activeSort?: K | null;
  sortDir?: GridSortDir | null;
  onSortColumn?: (key: K) => void;
  /** Commit a drag-resized width (px). Presence enables the resize grips. */
  onResizeColumn?: (key: string, px: number) => void;
  /** Per-mount glyph override; falls back to the factory config, then the type glyph. */
  glyphFor?: (column: C) => ReactNode;
  /** Per-mount label override (e.g. Receiving's `stage` → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;
}

/** Selection props, derived from the config's `selectMode`. */
type GridHeaderSelectProps<M extends GridHeaderSelectMode> = M extends 'always'
  ? { selectionScope: string; selectMode?: never }
  : M extends 'prop'
    ? { selectionScope?: string; selectMode?: boolean }
    : { selectionScope?: never; selectMode?: never };

export type GridColumnHeaderProps<
  C extends LedgerGridColumnModel,
  K extends string,
  M extends GridHeaderSelectMode,
> = GridColumnHeaderBaseProps<C, K> & GridHeaderSelectProps<M>;

export interface MakeLedgerGridColumnHeaderConfig<
  C extends LedgerGridColumnModel,
  M extends GridHeaderSelectMode,
> {
  layout: LedgerHeaderLayoutApi<C>;
  /** The family's full column model — the default when a caller passes none. */
  defaultColumns: readonly C[];
  /** Defaults to `'never'` (read-only browse). */
  selectMode?: M;
  /** Family-wide glyph override (e.g. Repair's date / price / ticket icons). */
  glyphFor?: (column: C) => ReactNode;
  /** Family-wide label override. */
  labelFor?: (column: C) => string | undefined;
}

export function makeLedgerGridColumnHeader<
  C extends LedgerGridColumnModel,
  K extends string = string,
  M extends GridHeaderSelectMode = 'never',
>({
  layout,
  defaultColumns,
  selectMode = 'never' as M,
  glyphFor: configGlyphFor,
  labelFor: configLabelFor,
}: MakeLedgerGridColumnHeaderConfig<C, M>): (
  props: GridColumnHeaderProps<C, K, M>,
) => ReactElement {
  return function GeneratedGridColumnHeader(props: GridColumnHeaderProps<C, K, M>) {
    const {
      columns = defaultColumns,
      className,
      isMobile = false,
      activeSort = null,
      sortDir = null,
      onSortColumn,
      onResizeColumn,
      glyphFor,
      labelFor,
    } = props;

    // `'prop'` is the only mode that reads a caller-supplied `selectMode`;
    // `'always'` forces it on and `'never'` cannot receive it (see the type).
    const scope = (props as { selectionScope?: string }).selectionScope;
    const callerSelectMode = (props as { selectMode?: boolean }).selectMode;
    const resolvedSelectMode =
      selectMode === 'always' ? true : selectMode === 'prop' ? Boolean(callerSelectMode) : false;

    return (
      <LedgerGridColumnHeader<C>
        columns={columns}
        layout={layout}
        isMobile={isMobile}
        selectMode={resolvedSelectMode}
        selectionScope={scope}
        className={className}
        activeSort={activeSort}
        sortDir={sortDir}
        // The cast is the whole reason a family used to hand-roll this: the DS
        // header speaks `string` keys, the family speaks its own union. One
        // cast here replaces twelve at the call sites.
        onSortColumn={onSortColumn ? (key: string) => onSortColumn(key as K) : undefined}
        onResizeColumn={onResizeColumn}
        glyphFor={glyphFor ?? configGlyphFor}
        labelFor={labelFor ?? configLabelFor}
      />
    );
  };
}
