/** `support.warranty` — Warranty-claims table definition (plan Phase 1, wave 2). */

import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { WARRANTY_SHEET_COLUMNS, type WarrantyGridColumn } from './warranty-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { WARRANTY_GRID_CAPABILITIES, makeWarrantyGridDescriptor } from './warranty-grid-descriptor';

export const WARRANTY_TABLE_DEFINITION = parseTableDefinition({
  id: 'support.warranty',
  tableId: 'warranty',
  entityFamily: 'warranty',
  cellMapKey: 'warranty',
  ariaLabel: 'Warranty claims',
  testId: 'warranty-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: WARRANTY_GRID_CAPABILITIES,
  columns: WARRANTY_SHEET_COLUMNS,
});

export const WARRANTY_TABLE_BINDING: TableSurfaceBinding<WarrantyClaimListRow, WarrantyGridColumn> = {
  definition: WARRANTY_TABLE_DEFINITION,
  columns: WARRANTY_SHEET_COLUMNS,
  makeDescriptor: makeWarrantyGridDescriptor,
  // The claim detail panel, keyed on `?open=`.
  recordPlane: { kind: 'inspector', occupantId: 'detail:warranty' },
};
