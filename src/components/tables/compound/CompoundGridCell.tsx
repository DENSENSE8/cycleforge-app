'use client';

/**
 * The compound cell, WRAPPER INCLUDED — the one implementation every family
 * mounts.
 *
 * ## Why the wrapper moved here
 *
 * `CompoundCells.tsx` shared the cell BODIES and left each family to supply the
 * surrounding `<div>` — grid-cell class, `data-col`, frozen token, sticky
 * offset. That sounded like a clean seam and was not one: the wrapper is where
 * a cell's POSITION is decided, so leaving it per-family left the layout forked
 * in the one place nobody thinks to compare. Both copies drifted, in opposite
 * directions, from the same column model:
 *
 * - Receiving pinned the `thumb` cell with `receivingGridFrozenLeft('thumb')`,
 *   a closure over the FLAT column constant, where `thumb` does not appear. The
 *   lookup missed, the offset collapsed to the first frozen slot, and under
 *   horizontal scroll the photo pinned on top of the checkbox.
 * - Orders never applied a frozen class to `thumb` at all, so the same column —
 *   declared `frozen: true` in the same shared model — simply scrolled away.
 *
 * One column model, two behaviours, neither of them the declared one. So the
 * wrapper is shared too, and it derives everything from the model that is
 * actually mounted: `col.frozen` decides sticky, `gridFrozenLeft(columns, key)`
 * decides the offset. A family now contributes an ADAPTER and a COLUMN ARRAY.
 * Never a cell — not the body, and not the box around it.
 *
 * ## What a family still passes
 *
 * Only per-surface facts the model cannot carry: the mounted `columns` (a
 * surface may hide tracks per staff), that staff's `columnDisplay` prefs, and
 * the two CAPABILITY handlers — `onCommitNote` (present ⇒ the note edits) and
 * `onOpen` (present ⇒ the chevron renders). Both are absence-means-read-only,
 * never a second component.
 */

import type { ReactNode } from 'react';
import {
  gridDataCellClass,
  gridColumnHighlightStyle,
  LEDGER_GRID_FROZEN_CELL,
  type GridColumnDisplayPref,
} from '@/design-system/components/grid';
import { gridFrozenLeft } from '@/design-system/components/grid/grid-column-geometry';
import { cn } from '@/utils/_cn';
import {
  CompoundFulfillment,
  CompoundItem,
  CompoundOpen,
  CompoundState,
  CompoundThumb,
} from './CompoundCells';
import { COMPOUND_ROW_PX } from './compound-row-chrome';
import type { CompoundRowView } from './compound-row-model';

/**
 * Structural, dependency-free by design — the same reason
 * `grid-column-geometry` types its params structurally. Every family's column
 * interface satisfies this.
 */
interface CompoundCellColumn {
  key: string;
  width: string;
  frozen?: boolean;
  hideKey?: string;
  align?: 'start' | 'end';
}

export interface CompoundGridCellParams<C extends CompoundCellColumn> {
  col: C;
  /** The MOUNTED model — sticky offsets derive from it, never from a constant. */
  columns: readonly C[];
  /** False on the last visible column (drops the trailing rule). */
  rule: boolean;
  view: CompoundRowView;
  /** Per-staff column display prefs, keyed by `hideKey`. */
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
  /** Present ⇒ the note line edits in place. Absent ⇒ read-only. */
  onCommitNote?: (next: string) => void;
  /** Present ⇒ the trailing chevron renders. Absent ⇒ empty track. */
  onOpen?: () => void;
}

/** Is this a compound track — i.e. will {@link renderCompoundGridCell} paint it? */
export function isCompoundCellKey(key: string): boolean {
  return (
    key === 'thumb' ||
    key === 'item' ||
    key === 'fulfillment' ||
    key === 'state' ||
    key === 'open'
  );
}

/**
 * Paint one compound track, wrapper and all. Returns `null` for any other key,
 * so a family's dispatcher can fall through to its own flat cells.
 */
export function renderCompoundGridCell<C extends CompoundCellColumn>({
  col,
  columns,
  rule,
  view,
  columnDisplay,
  onCommitNote,
  onOpen,
}: CompoundGridCellParams<C>): ReactNode {
  if (!isCompoundCellKey(col.key)) return null;

  // ## The compound cell OWNS the row box
  //
  // `inset: 'grid'` (the flat spreadsheet's chrome) adds `py-1.5`. Stacked on
  // the cell's own 1px bottom rule that turned a 48px constant into a 61px
  // painted row on every compound table — the constant was sizing the cell's
  // CONTENT while the goal, the virtualizer estimate and the operator's eye all
  // mean the ROW. Three consumers, two different numbers, and no test could see
  // it because they all agreed about the 48.
  //
  // So: horizontal inset only, and an explicit border-box height. The row shell
  // is `items-stretch`, so one cell claiming the box sets the row and every
  // other track stretches to it. The two-row body inside fills what is left of
  // the height after the rule (`h-full`), which is why nothing here needs to
  // know that the rule costs a pixel.
  const className = cn(
    gridDataCellClass(col, {
      rule,
      inset: 'cell',
      columnDisplay,
      frozenClass: LEDGER_GRID_FROZEN_CELL,
    }),
    'overflow-hidden',
  );

  // The trailing frozen track owns the scroll-edge shadow. Derived from the
  // mounted array for the same reason the offset is: a family constant names a
  // key the compound model does not carry.
  const frozenEdge =
    col.frozen && [...columns].reverse().find((c) => c.frozen)?.key === col.key
      ? true
      : undefined;

  const pref = col.hideKey && columnDisplay ? columnDisplay[col.hideKey] : undefined;
  const highlight = gridColumnHighlightStyle(pref?.highlight);
  const style = {
    // The ONE number. Border-box, so the cell's bottom rule is inside it and the
    // painted row measures exactly `COMPOUND_ROW_PX` — the same value
    // `compoundRowEstimateFor` hands the virtualizer.
    height: COMPOUND_ROW_PX,
    ...highlight,
    // Derived from the MOUNTED array. A key-only closure over a family's flat
    // constant is what broke this before — see the file docblock.
    ...(col.frozen ? { left: gridFrozenLeft(columns, col.key) } : null),
  };

  switch (col.key) {
    case 'thumb':
      return (
        <div data-col="thumb" data-frozen-edge={frozenEdge} className={cn(className, 'items-center')} style={style}>
          <CompoundThumb view={view} />
        </div>
      );
    case 'fulfillment':
      return (
        <div data-col="fulfillment" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundFulfillment view={view} />
        </div>
      );
    case 'item':
      return (
        <div data-col="item" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundItem view={view} onCommitNote={onCommitNote} />
        </div>
      );
    case 'state':
      return (
        <div data-col="state" data-frozen-edge={frozenEdge} className={className} style={style}>
          <CompoundState view={view} />
        </div>
      );
    default:
      return (
        <div data-col="open" data-frozen-edge={frozenEdge} className={cn(className, 'justify-end')} style={style}>
          <CompoundOpen onOpen={onOpen} />
        </div>
      );
  }
}
