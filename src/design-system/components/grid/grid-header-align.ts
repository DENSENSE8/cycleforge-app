/** Grid column justification SoT — **one decision per column, read by both the header and the cell.** */

import type { ColumnType } from '@/lib/tables/table-columns';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

export type GridColumnAlign = 'start' | 'end' | 'center';


/**
 * Data type → justification.
 * operator re-adjudicated dates alone. 2026-08-04 split `tracking` off
 */
const ALIGN_BY_TYPE: Record<ColumnType, GridColumnAlign> = {
  number: 'end',
  price: 'end',
  id: 'start',
  date: 'end',
  location: 'start',
  tracking: 'start',
  text: 'start',
  longtext: 'start',
  tag: 'start',
  external: 'start',
  image: 'start',
};

/** The column's justification — explicit `align` wins, else derived from `type`, else `start` (an untyped column is structural chrome, e.g. */
export function resolveGridColumnAlign(
  column: Pick<LedgerGridColumnModel, 'type' | 'align'>,
): GridColumnAlign {
  if (column.align) return column.align;
  return column.type ? ALIGN_BY_TYPE[column.type] : 'start';
}

/** Flex + text justification. */
function alignClass(align: GridColumnAlign): string {
  if (align === 'end') return 'justify-end text-right';
  if (align === 'center') return 'justify-center text-center';
  return 'justify-start text-left';
}

/** Header justification — pass `resolveGridColumnAlign(column)`, never a literal. */
export function gridHeaderCellAlignClass(align: GridColumnAlign = 'start'): string {
  return alignClass(align);
}

/** Value-cell justification for a column — the cell half of the same decision. */
export function gridCellAlignClass(
  column: Pick<LedgerGridColumnModel, 'type' | 'align'>,
): string {
  return alignClass(resolveGridColumnAlign(column));
}
