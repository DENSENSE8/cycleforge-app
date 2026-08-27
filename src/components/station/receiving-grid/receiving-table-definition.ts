/**
 * `receiving.browse` — the golden table definition (plan Phase 1).
 *
 * Unbox / History / Testing browse. This is the first surface lifted onto the
 * definition registry, so it is deliberately a *re-declaration of nothing*: the
 * columns are `RECEIVING_GRID_COLUMNS` and the capabilities are
 * `RECEIVING_GRID_CAPABILITIES`, both by reference. The definition adds only
 * what used to live as literals on the page mount — the shell recipe
 * (`surface: 'sheet'`), the prefs bucket, the accessible name, the testid and
 * the day-band default.
 *
 * Everything still per-family stays per-family: the cells
 * (`receiving-grid/cells/*`), the row/group/header renderers, the sort
 * comparator, and `makeReceivingGridDescriptor`.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  RECEIVING_GRID_COLUMNS,
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
  // `WORKBENCH_SHEET_HOST`.
  surface: 'sheet',
  // Date is a per-row column on this family; Testing History opts back in via
  // the host's `showDayHeaders` override.
  showDayHeaders: false,
  capabilities: RECEIVING_GRID_CAPABILITIES,
  columns: RECEIVING_GRID_COLUMNS,
});

export const RECEIVING_TABLE_BINDING: TableSurfaceBinding<ReceivingLineRow, ReceivingGridColumn> = {
  definition: RECEIVING_BROWSE_DEFINITION,
  columns: RECEIVING_GRID_COLUMNS,
  makeDescriptor: makeReceivingGridDescriptor,
  /**
   * The History plane. This binding has THREE mounts and they do not agree:
   * Unbox Recent/Queue and Testing open the station work surface
   * (`LineEditPanel` / `TestingPanel`) rather than a desk peek, and both pass a
   * `recordPlane` override at the mount — the same "a real second mount, never
   * a preference" escape `tableId` / `ariaLabel` / `testId` already use. The
   * binding declares the desk default; a station mount says so out loud.
   */
  recordPlane: { kind: 'inspector', occupantId: 'detail:history' },
};
