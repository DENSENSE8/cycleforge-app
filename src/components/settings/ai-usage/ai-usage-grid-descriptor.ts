/**
 * AI usage grid surface descriptor — lifts the MOUNTED column model (a
 * `SlotLayout` materialization) into the TanStack defs `LedgerGridSurface`
 * mounts.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';
import {
  defaultDirForAiUsageColumn,
  isAiUsageColumnSortable,
  type AiUsageGridColumn,
} from './ai-usage-grid-layout';

/**
 * A usage roll-up is a READ MAP with no verbs at all. `amount` is KEPT — the
 * estimated cost is real money and belongs in the money track, end-aligned and
 * tabular, which is exactly what that column is for.
 */
export const AIUSAGE_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeAiUsageGridDescriptor(
  columns: readonly AiUsageGridColumn[],
): GridSurfaceDescriptor<AiUsageTableRow, AiUsageGridColumn> {
  return makeGridSurfaceDescriptor<AiUsageTableRow, AiUsageGridColumn>(
    'settings.ai-usage',
    columns,
    {
      isSortable: (key) => isAiUsageColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForAiUsageColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    AIUSAGE_GRID_CAPABILITIES,
  );
}
