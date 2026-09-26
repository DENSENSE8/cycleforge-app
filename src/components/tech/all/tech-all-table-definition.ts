/** `tech.all` — Tech All triage table definition (plan Phase 1, wave 2). */

import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { TECH_ALL_SHEET_COLUMNS, type TechAllGridColumn } from '@/lib/tech/tech-all-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { TECH_ALL_GRID_CAPABILITIES, makeTechAllGridDescriptor } from './tech-all-grid-descriptor';

const TECH_ALL_TABLE_DEFINITION = parseTableDefinition({
  id: 'tech.all',
  tableId: 'tech-all',
  entityFamily: 'tech-all',
  cellMapKey: 'tech-all',
  ariaLabel: 'Tech All triage',
  testId: 'tech-all-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: TECH_ALL_GRID_CAPABILITIES,
  columns: TECH_ALL_SHEET_COLUMNS,
});

export const TECH_ALL_TABLE_BINDING: TableSurfaceBinding<TechAllTriageRow, TechAllGridColumn> = {
  definition: TECH_ALL_TABLE_DEFINITION,
  columns: TECH_ALL_SHEET_COLUMNS,
  makeDescriptor: makeTechAllGridDescriptor,
  // A triage row is a POINTER at work living somewhere else:
  recordPlane: {
    kind: 'navigate',
    reason:
      'Rows point at work owned elsewhere — receiving lines open their station bench, repairs and pickups route to their own desk.',
  },
};
