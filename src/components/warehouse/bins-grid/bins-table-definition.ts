/** `warehouse.bins` — Warehouse bins table definition (plan Phase 1, wave 3). */

import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { BINS_SHEET_COLUMNS, type BinsGridColumn } from './bins-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { BINS_GRID_CAPABILITIES, makeBinsGridDescriptor } from './bins-grid-descriptor';

export const BINS_TABLE_DEFINITION = parseTableDefinition({
  id: 'warehouse.bins',
  tableId: 'bins',
  entityFamily: 'bins',
  cellMapKey: 'bins',
  ariaLabel: 'Warehouse bins',
  testId: 'bins-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: BINS_GRID_CAPABILITIES,
  columns: BINS_SHEET_COLUMNS,
});

export const BINS_TABLE_BINDING: TableSurfaceBinding<BinsOverviewRow, BinsGridColumn> = {
  definition: BINS_TABLE_DEFINITION,
  columns: BINS_SHEET_COLUMNS,
  makeDescriptor: makeBinsGridDescriptor,
  // The bin flyout — a peek at what a location holds, opened from the row.
  recordPlane: { kind: 'inspector', occupantId: 'detail:bin' },
};
