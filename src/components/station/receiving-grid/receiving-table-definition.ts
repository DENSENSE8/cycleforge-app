/** `receiving.browse` — the golden table definition (plan Phase 1). */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  RECEIVING_COMPOUND_COLUMNS,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  RECEIVING_GRID_CAPABILITIES,
  makeReceivingGridDescriptor,
} from './receiving-grid-descriptor';

/**
 * Validated at module load: a definition that violates a structural law (frozen
 * pane not a leading prefix, two flex tracks, a default set past the dense
 * ceiling) throws here rather than painting a broken grid.
 */
export const RECEIVING_BROWSE_DEFINITION = parseTableDefinition({
  id: 'receiving.browse',
  tableId: 'receiving',
  entityFamily: 'receiving',
  cellMapKey: 'receiving',
  ariaLabel: 'Receiving carton lines',
  testId: 'receiving-grid-body',
  // Flush Sheets plane — the Workbench spreadsheet recipe. Hosts pair it with
  // `'relative flex min-h-0 min-w-0 flex-1 flex-col'`.
  surface: 'sheet',
  // Date is a per-row column on this family; Testing History opts back in via
  // the host's `showDayHeaders` override.
  showDayHeaders: false,
  capabilities: RECEIVING_GRID_CAPABILITIES,
  columns: RECEIVING_COMPOUND_COLUMNS,
});

export const RECEIVING_TABLE_BINDING: TableSurfaceBinding<ReceivingLineRow, ReceivingGridColumn> = {
  definition: RECEIVING_BROWSE_DEFINITION,
  columns: RECEIVING_COMPOUND_COLUMNS,
  makeDescriptor: makeReceivingGridDescriptor,
  /** The History plane. */
  recordPlane: {
    kind: 'stage-overlay',
    reason:
      'Unbox History opens the carton on DeskRecordPlane — in place of the list, or beside it in fullscreen (?openLine=).',
  },
};
