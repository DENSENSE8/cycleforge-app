/**
 * `tech.all` — Tech All triage table definition (plan Phase 1, wave 2).
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and prefs bucket are the literals the
 * mount used to carry. Frozen pane is `select · identity` (not `select · order`).
 */

import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { TECH_ALL_GRID_COLUMNS, type TechAllGridColumn } from '@/lib/tech/tech-all-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { TECH_ALL_GRID_CAPABILITIES, makeTechAllGridDescriptor } from './tech-all-grid-descriptor';

export const TECH_ALL_TABLE_DEFINITION = parseTableDefinition({
  id: 'tech.all',
  tableId: 'tech-all',
  entityFamily: 'tech-all',
  cellMapKey: 'tech-all',
  ariaLabel: 'Tech All triage',
  testId: 'tech-all-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: TECH_ALL_GRID_CAPABILITIES,
  columns: TECH_ALL_GRID_COLUMNS,
});

export const TECH_ALL_TABLE_BINDING: TableSurfaceBinding<TechAllTriageRow, TechAllGridColumn> = {
  definition: TECH_ALL_TABLE_DEFINITION,
  columns: TECH_ALL_GRID_COLUMNS,
  makeDescriptor: makeTechAllGridDescriptor,
  // A triage row is a POINTER at work living somewhere else: a receiving line
  // hands off to its station bench, a repair or a pickup navigates to its own
  // desk (`/repair?openRepair=`, `/pickup?lcpu=`). There is no record of "a
  // triage row" to peek at, so an inspector here would open a panel about a
  // join, not about a thing.
  recordPlane: {
    kind: 'navigate',
    reason:
      'Rows point at work owned elsewhere — receiving lines open their station bench, repairs and pickups route to their own desk.',
  },
};
