/**
 * `receiving.browse` — the golden table definition (plan Phase 1).
 *
 * Unbox / History / Testing browse. This is the first surface lifted onto the
 * definition registry. Its canonical columns are the COMPOUND materialization
 * of the product slot layout (`RECEIVING_COMPOUND_COLUMNS`) — what Unbox,
 * History and Testing actually mount — and the capabilities are
 * `RECEIVING_GRID_CAPABILITIES` by reference.
 *
 * ## The flat model is a second MOUNT, not the default
 *
 * `TestingHistoryList` still paints the flat spreadsheet, and it used to get it
 * by passing no `columns` at all and inheriting this definition's array. That
 * made the hand model the family's canonical answer by SILENCE: the drift guard
 * compared the definition against itself and passed, while the three compound
 * desks mounted something else entirely. The definition now names the model the
 * desks paint, and that one surface passes `RECEIVING_GRID_COLUMNS` explicitly
 * — the same "a real second mount, never a preference" escape `tableId` /
 * `ariaLabel` / `testId` already use. Giving it its own layout id is the next
 * step (plan §03, wave 1.3). The definition adds only
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
