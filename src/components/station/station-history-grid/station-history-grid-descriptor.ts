/**
 * Tech / Packer history grid descriptor — ORDERS_QUEUE_COLUMNS over
 * {@link STATION_HISTORY_GRID_CAPABILITIES} (no outbound triage wash).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import {
  isOrdersQueueFrozen,
  type OrdersQueueColumn,
} from '@/lib/dashboard-order-row-layout';
import { isQueueColumnSort } from '@/utils/queue-display-sort';
import { STATION_HISTORY_GRID_CAPABILITIES } from '@/components/station/station-history-capabilities';

export function makeStationHistoryGridDescriptor(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<QueueRowRecord, OrdersQueueColumn> {
  return makeGridSurfaceDescriptor<QueueRowRecord, OrdersQueueColumn>(
    'station-history.browse',
    columns,
    {
      isSortable: isQueueColumnSort,
      sortDescFirst: () => false,
      isLocked: isOrdersQueueFrozen,
    },
    STATION_HISTORY_GRID_CAPABILITIES,
  );
}
