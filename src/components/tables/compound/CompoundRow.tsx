'use client';

/**
 * The compound ROW — the one row component, for every table.
 *
 * ## Why this exists
 *
 * The cells were shared, then the cell WRAPPERS were shared, and each time the
 * fork simply moved outward one layer. It ended up in the row components:
 * `TasksGridRow` and `DailyGridRow` were 120-line twins that each took eight
 * bespoke props, each built a view, each mapped columns, and each hand-rolled a
 * row shell with its own selection wash. Two components doing one job, drifting
 * by exactly as much as nobody happened to compare.
 *
 * So the row is shared too, and the fork has nowhere left to move. A family now
 * INSERTS ITS DATA and nothing else:
 *
 * - a {@link CompoundRowView} — the row's facts, from a pure adapter;
 * - the mounted `columns`;
 * - the capabilities it actually has (`select`, `onOpen`);
 * - whatever DOM hooks its own interaction needs, passed straight through.
 *
 * There is deliberately no per-family prop for geometry, template, cell class,
 * row shell, selection paint or frozen offset. Those are all answers the shared
 * model already carries, and every one of them was a place two families had
 * previously answered differently.
 *
 * ## What a family may still bring
 *
 * The DOM props spread (`role`, `aria-*`, `onClick`, `onKeyDown`, `data-*`).
 * That is not a fork: a row's *gesture contract* is genuinely per-surface — a
 * checklist row opens a record on click while a click-select grid row toggles
 * membership — and those are behaviours, not layout. What they can no longer do
 * is disagree about how the row is BUILT.
 */

import type { HTMLAttributes, ReactNode } from 'react';
import {
  gridDataCellClass,
  LedgerGridLeafRow,
  type GridSurfaceCapabilities,
} from '@/design-system/components/grid';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { renderCompoundGridCell } from './CompoundGridCell';
import type { CompoundRowAction, CompoundRowView } from './compound-row-model';

/** Structural — every family's column interface satisfies it. */
interface CompoundRowColumn {
  key: string;
  width: string;
  frozen?: boolean;
  hideKey?: string;
  align?: 'start' | 'end';
}

export interface CompoundRowProps<C extends CompoundRowColumn>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The MOUNTED model. Template, sticky offsets and cell insets all derive. */
  columns: readonly C[];
  /** This row's facts — the family's pure `row -> view` adapter output. */
  view: CompoundRowView;
  selected: boolean;
  capabilities: Pick<GridSurfaceCapabilities, 'rowTriageFlags'>;
  /** Present ⇒ the leading gutter paints a checkmark. See `CompoundSelect`. */
  select?: {
    checked: boolean | 'mixed';
    onToggle?: () => void;
    label: string;
    disabled?: boolean;
  };
  /** Present ⇒ the ⋮ menu carries an "Open" item. */
  onOpen?: () => void;
  /** Extra verbs for this row's ⋮ menu, after "Open". */
  actions?: readonly CompoundRowAction[];
  /** Override mobile stacking (almost always false under LedgerGrid). */
  isMobile?: boolean;
}

export function CompoundRow<C extends CompoundRowColumn>({
  columns,
  view,
  selected,
  capabilities,
  select,
  onOpen,
  actions,
  isMobile = false,
  className,
  ...rowProps
}: CompoundRowProps<C>) {
  // The org-shared column formatting for this sheet. Read HERE — one component
  // that every compound family already mounts — rather than threaded as a prop

  const renderCell = (col: C, last: boolean): ReactNode => {
    const rule = !last;
    const cell = renderCompoundGridCell({
      col,
      columns,
      rule,
      view,
      select,
      onOpen,
      actions,
    });
    if (cell) return cell;

    // `_fill` and anything the compound renderer does not own: an empty cell
    // that still carries the track's chrome, so the row's rules stay unbroken.
    return (
      <div
        data-col={col.key}
        role="presentation"
        aria-hidden
        className={gridDataCellClass(col, { rule: col.key !== '_fill' && rule, inset: 'grid' })}
      />
    );
  };

  return (
    <LedgerGridLeafRow
      {...rowProps}
      className={className}
      columns={columns}
      template={gridTemplate(columns)}
      selected={selected}
      capabilities={capabilities}
      isMobile={isMobile}
      renderCell={(col, { last }) => renderCell(col, last)}
    />
  );
}
