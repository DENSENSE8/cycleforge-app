/**
 * To-Ship desk column model — ported from the shared orders queue SoT.
 *
 * The desk fork owns its own `tableId` (`to-ship-desk`) and definition ids
 * (`to-ship.*`). Columns start identical to `ORDERS_QUEUE_*`; cut station-only
 * tracks here when the desk diverges — never mutate `orders-table-definition.ts`
 * in ways that break Ready-to-Pack / Packing embeds.
 */

export {
  ORDERS_QUEUE_COLUMNS as TO_SHIP_DESK_COLUMNS,
  ORDERS_QUEUE_TESTED_COLUMNS as TO_SHIP_DESK_TESTED_COLUMNS,
  type OrdersQueueColumn as ToShipDeskColumn,
} from '@/lib/dashboard-order-row-layout';
