'use client';

import {
  makeLedgerGridColumnHeader,
  type LedgerHeaderLayoutApi,
} from '@/design-system/components/grid';
import {
  REPAIR_GRID_COLUMNS,
  isRepairGridSortable,
  type RepairGridColumn,
  type RepairGridColumnKey,
} from '@/lib/repair/repair-grid-layout';

/**
 * The per-family layout fields this carried were aliases of the same shared
 * functions; `LedgerHeaderLayoutApi` collapsed them. What stays per family is
 * which columns sort and where the frozen edge sits.
 */
const REPAIR_HEADER_LAYOUT: LedgerHeaderLayoutApi = {
  isSortable: isRepairGridSortable,
};

/**
 * Sticky column header for the repair queue LedgerGrid. Repair multi-select is
 * always-on, so `selectMode: 'always'` makes `selectionScope` a REQUIRED prop.
 *
 * Glyphs come from the column `type` vocabulary — `date` → Calendar, `id` →
 * Ticket, `price` → Receipt. The family override this used to carry was removed
 * with `glyphFor`: it hand-picked the same two glyphs the type SoT already
 * resolves, which is a second answer to a settled question.
 */
export const RepairGridColumnHeader = makeLedgerGridColumnHeader<
  RepairGridColumn,
  RepairGridColumnKey,
  'always'
>({
  layout: REPAIR_HEADER_LAYOUT,
  defaultColumns: REPAIR_GRID_COLUMNS,
  selectMode: 'always',
  tableId: 'repair',
});
