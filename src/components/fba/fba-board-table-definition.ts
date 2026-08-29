/**
 * `fba.board` — the Amazon Prep shipment board's table definition.
 *
 * Completes the debt `fba-board-capabilities.ts` recorded in 2026-08-01: the
 * board reached `LedgerGrid` with a capabilities bag but no column model and no
 * descriptor, so it was the last surface in the product outside the definition
 * waist. The model landed with `fba-board-grid-layout.ts`; this is the binding
 * that puts the board in `REGISTERED_BINDINGS` — the list a table has to be in
 * to be in the product.
 *
 * Re-declares nothing: columns and capabilities are the family SoT by reference.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { FBA_BOARD_GRID_CAPABILITIES } from '@/components/fba/fba-board-capabilities';
import {
  FBA_BOARD_GRID_COLUMNS,
  type FbaBoardGridColumn,
} from '@/components/fba/fba-board-grid-layout';
import { makeFbaBoardGridDescriptor } from '@/components/fba/fba-board-grid-descriptor';
import type { FbaBoardItem } from '@/lib/fba/types';

export const FBA_BOARD_TABLE_DEFINITION = parseTableDefinition({
  id: 'fba.board',
  tableId: 'fba',
  entityFamily: 'fba',
  cellMapKey: 'fba',
  ariaLabel: 'FBA shipment board',
  testId: 'fba-board-body',
  surface: 'sheet',
  // Day-banded by due date — the board's whole organising question is "what is
  // closest to late", and the bands are how an operator reads that at a glance.
  showDayHeaders: true,
  capabilities: FBA_BOARD_GRID_CAPABILITIES,
  columns: FBA_BOARD_GRID_COLUMNS,
});

export const FBA_BOARD_TABLE_BINDING: TableSurfaceBinding<FbaBoardItem, FbaBoardGridColumn> = {
  definition: FBA_BOARD_TABLE_DEFINITION,
  columns: FBA_BOARD_GRID_COLUMNS,
  makeDescriptor: makeFbaBoardGridDescriptor,
  // The board's row opens the shipment detail flyout the workspace owns
  // (`onDetailOpen`), keyed per record: a board is walked by scanning it, not by
  // stepping prev/next through a queue, so a per-record occupant id never plays
  // the exit→empty→enter that keying costs on a walked surface.
  recordPlane: {
    kind: 'inspector',
    occupantId: 'detail:fba-shipment',
    keyedByRecord:
      'A board is read by scanning it, not walked prev/next — the re-key never plays.',
  },
};
