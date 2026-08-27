import { ledgerGridCell, type LedgerGridCellInset } from './grid-cell-chrome';
import { gridCellAlignClass } from './grid-header-align';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';
import { gridColumnTextEmphasisClass, type GridColumnDisplayPref } from './grid-column-display';
import { cn } from '@/utils/_cn';

/** Structural, dependency-free — every family's column model satisfies it. */
interface DataCellColumn extends Pick<LedgerGridColumnModel, 'type' | 'align'> {
  key: string;
  frozen?: boolean;
  /** Per-staff display bucket key (`staff_preferences.tableColumns.<id>`). */
  hideKey?: string;
}

/**
 * The ONE body-cell class composition for a LedgerGrid data cell.
 *
 * Four concerns, and every family needs all four — but until now each family
 * assembled its own subset, so the subsets drifted rather than the base:
 *
 *  1. `ledgerGridCell` — inset + rule. Already shared (`ordersQueueGridCell`
 *     and `receivingGridCell` are both thin aliases onto it).
 *  2. `gridCellAlignClass` — derived from column `type`. Already shared.
 *  3. **`gridColumnTextEmphasisClass` — was NOT shared.** Receiving applied the
 *     per-staff column text emphasis; Orders / To-Ship never did and had no
 *     `columnDisplay` in scope to apply it from. So a staffer who set a column
 *     to muted/emphasis/warning saw it honoured on Unbox History and silently
 *     ignored on To-Ship — one preference, two answers.
 *  4. frozen sticky class — per-family token, passed in.
 *
 * Concerns 1 and 2 were already one SoT each; what diverged was the ASSEMBLY.
 * That is the shape of most drift here: shared parts, forked composition.
 */
export function gridDataCellClass(
  col: DataCellColumn,
  opts: {
    rule?: boolean;
    inset?: LedgerGridCellInset;
    /** Resolved per-staff display prefs, keyed by the column's `hideKey`. */
    columnDisplay?: Record<string, GridColumnDisplayPref> | undefined;
    /** The family's frozen-cell token, applied when the column is frozen. */
    frozenClass?: string;
  } = {},
): string {
  const { rule = true, inset = 'grid', columnDisplay, frozenClass } = opts;
  const pref = col.hideKey && columnDisplay ? columnDisplay[col.hideKey] : undefined;
  return cn(
    ledgerGridCell({ rule, inset }),
    gridCellAlignClass(col),
    gridColumnTextEmphasisClass(pref?.text),
    col.frozen && frozenClass,
  );
}
