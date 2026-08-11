/**
 * `inbound.incoming` — the Incoming POS table definition (plan Phase 1, wave 1).
 *
 * The second surface onto the registry, and the one that proves the host is not
 * receiving-shaped:
 *
 * - its own capabilities bag (`dayBands: false` — Date is a per-row column, no
 *   sticky bands), distinct from receiving's;
 * - a second `entityFamily` / `cellMapKey`;
 * - **two prefs buckets from one definition** — the default `incoming` desk and
 *   the Unbox pinned-Inbound `incoming_embed`, the latter passed as a `tableId`
 *   override at the mount so hiding a heavy column on the Unbox Inbound tab never
 *   touches the full `/incoming` density (Gemini D13). That override is the same
 *   mechanism Testing History uses on `receiving.browse`.
 *
 * Re-declares nothing: columns and capabilities are the family SoT by reference;
 * the shell recipe, aria name, testid and day-band default are the literals the
 * mount used to carry.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  INCOMING_GRID_COLUMNS,
  type IncomingGridColumn,
} from '@/lib/receiving/incoming-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  INCOMING_GRID_CAPABILITIES,
  makeIncomingGridDescriptor,
} from './incoming-grid-descriptor';

export const INCOMING_TABLE_DEFINITION = parseTableDefinition({
  id: 'inbound.incoming',
  tableId: 'incoming',
  entityFamily: 'incoming',
  cellMapKey: 'incoming',
  ariaLabel: 'Incoming cartons',
  testId: 'incoming-grid-body',
  surface: 'sheet',
  // Date is a per-row column on Incoming — no sticky day bands.
  showDayHeaders: false,
  capabilities: INCOMING_GRID_CAPABILITIES,
  columns: INCOMING_GRID_COLUMNS,
});

export const INCOMING_TABLE_BINDING: TableSurfaceBinding<ReceivingLineRow, IncomingGridColumn> = {
  definition: INCOMING_TABLE_DEFINITION,
  columns: INCOMING_GRID_COLUMNS,
  makeDescriptor: makeIncomingGridDescriptor,
  recordPlane: { kind: 'inspector', occupantId: 'detail:incoming' },
};
