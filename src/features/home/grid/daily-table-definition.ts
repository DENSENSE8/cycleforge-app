/**
 * `home.daily` — the Home → Daily AGENDA table definition.
 *
 * Re-declares nothing: the columns are the ENGINE's materialization of
 * {@link DAILY_FAMILY}, and the shell recipe, accessible name, testid and prefs
 * bucket are the literals the mount used to carry.
 *
 * The capability bag and the descriptor factory were folded in here from
 * `daily-grid-descriptor.ts` when `daily` ported to the family record
 * (2026-09-22), the same shape `tasks` took: a family contributes a record, an
 * adapter, a resolver and a registry entry — not a column module and not a
 * layout wrapper.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  defaultDirForSlotTableColumn,
  isSlotTableColumnSortable,
  slotTableColumnsFor,
  type SlotTableColumn,
} from '@/components/tables/compound/slot-table-columns';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { DAILY_FAMILY, DAILY_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/daily';
import type { DailyAgendaRow } from '@/lib/daily/daily-agenda-row';

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const DAILY_COMPOUND_COLUMNS: readonly SlotTableColumn[] = slotTableColumnsFor(
  DAILY_FAMILY,
  DAILY_PRODUCT_LAYOUT,
);

/**
 * Daily is a CHECKLIST — on BOTH halves — and the capability bag says so:
 *
 * `multiSelect: false` — the gutter checkbox is the surface's primary VERB
 * (tick the item; mark the task done), not a selection. Declaring multi-select
 * would mount the select-all wiring on top of it, which would give one control
 * two meanings and put "mark everything done" behind a header control that
 * looks like selection. Merging the two feeds did not change that: the task
 * half's tick is a status write, which is the same verb the checklist half's
 * tick already was.
 *
 * `inCellEdit: false` — renaming a checklist item edits the org's list for
 * every staffer on every future day, and re-wording a handoff belongs with the
 * task's other facts. Both are record-plane acts, not cell acts.
 */
export const DAILY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so a
 * header's sortability is answered against the tracks actually mounted.
 *
 * Sortability is a property of the BOUND FACT, not of the track: the compound
 * `thumb` / `_fill` tracks carry nothing to order by, and the engine's
 * `isSlotTableColumnSortable` is the one answer for the descriptor and the URL
 * guard alike.
 */
export function makeDailyGridDescriptor(
  columns: readonly SlotTableColumn[],
): GridSurfaceDescriptor<DailyAgendaRow, SlotTableColumn> {
  return makeGridSurfaceDescriptor<DailyAgendaRow, SlotTableColumn>(
    'home.daily',
    columns,
    {
      isSortable: (key) => isSlotTableColumnSortable(DAILY_FAMILY, columns, key),
      sortDescFirst: (key) =>
        defaultDirForSlotTableColumn(DAILY_FAMILY, columns, key) === 'desc',
    },
    DAILY_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const DAILY_TABLE_DEFINITION = parseTableDefinition({
  id: 'home.daily',
  tableId: 'daily',
  entityFamily: 'daily',
  cellMapKey: 'daily',
  ariaLabel: 'Daily agenda',
  testId: 'daily-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: DAILY_GRID_CAPABILITIES,
  columns: DAILY_COMPOUND_COLUMNS,
});

export const DAILY_TABLE_BINDING: TableSurfaceBinding<DailyAgendaRow, SlotTableColumn> = {
  definition: DAILY_TABLE_DEFINITION,
  columns: DAILY_COMPOUND_COLUMNS,
  makeDescriptor: makeDailyGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:daily-check' },
};
