/**
 * `station-history.browse` — Tech / Packer history All layout.
 *
 * One binding; Packer overrides `tableId="packer"` at the mount so Fields
 * prefs stay independent of Tech. Columns are ORDERS_QUEUE_COLUMNS by
 * reference. Capabilities stay the station-history bag (no outbound triage).
 */

import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  ORDERS_QUEUE_COLUMNS,
  type OrdersQueueColumn,
} from '@/lib/dashboard-order-row-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { STATION_HISTORY_GRID_CAPABILITIES } from '@/components/station/station-history-capabilities';
import { makeStationHistoryGridDescriptor } from './station-history-grid-descriptor';

const STATION_HISTORY_TABLE_DEFINITION = parseTableDefinition({
  id: 'station-history.browse',
  tableId: 'tech',
  entityFamily: 'station-history',
  cellMapKey: 'station-history',
  ariaLabel: 'Station records',
  testId: 'station-history-grid-body',
  surface: 'sheet',
  showDayHeaders: true,
  capabilities: STATION_HISTORY_GRID_CAPABILITIES,
  columns: ORDERS_QUEUE_COLUMNS,
});

export const STATION_HISTORY_TABLE_BINDING: TableSurfaceBinding<
  QueueRowRecord,
  OrdersQueueColumn
> = {
  definition: STATION_HISTORY_TABLE_DEFINITION,
  columns: ORDERS_QUEUE_COLUMNS,
  makeDescriptor: makeStationHistoryGridDescriptor,
  recordPlane: {
    kind: 'station',
    reason:
      'opens station details via useStationDetailsSelection, not a desk peek',
  },
};
