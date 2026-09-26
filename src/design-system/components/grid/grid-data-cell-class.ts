import { ledgerGridCell, type LedgerGridCellInset } from './grid-cell-chrome';
import { gridCellAlignClass } from './grid-header-align';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';
import { cn } from '@/utils/_cn';

/** Structural, dependency-free — every family's column model satisfies it. */
interface DataCellColumn {
  key: string;
  type?: LedgerGridColumnModel['type'];
  align?: LedgerGridColumnModel['align'];
  frozen?: boolean;
  hideKey?: string;
}

/** The ONE body-cell class composition for a LedgerGrid data cell. */
export function gridDataCellClass(
  col: DataCellColumn,
  opts: {
    rule?: boolean;
    inset?: LedgerGridCellInset;
    /** The family's frozen-cell token, applied when the column is frozen. */
    frozenClass?: string;
    /** Org-shared column formatting from `columnFormatClass`. */
    formatClass?: string;
  } = {},
): string {
  const { rule = true, inset = 'grid', frozenClass, formatClass } = opts;
  return cn(
    ledgerGridCell({ rule, inset }),
    gridCellAlignClass(col),
    col.frozen && frozenClass,
    formatClass,
  );
}
