/**
 * Station-bench flat column model — BENCH-OWNED legacy, on death row.
 *
 * This is the old `ORDERS_QUEUE_COLUMNS` hand array, moved here by the slot
 * plan's Wave 1 kill (`docs/kill-list/07-slot-table-hand-models.md`): the
 * Orders desk no longer owns a hand column model — every outbound lane mounts
 * the compound model materialized from the effective `SlotLayout`
 * (`ordersCompoundColumnsFor`). The Tech / Packer history benches
 * (`StationHistoryTable` → `StationQueueRow` → `OrdersQueueTableRow`'s flat
 * cell registry) are the ONE remaining consumer, and their stack is the kill
 * list's separate "station history" item — when that runs, this file goes
 * with it (a real binding + catalog, or the host fork dies).
 *
 * Do NOT bind new surfaces to this array, and do not re-import it from the
 * Orders layout module — a track whose key IS a field (`tester`, `testedAt`,
 * `packStation`) is exactly the frozen layout the slot engine replaces.
 */

import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';

export const STATION_HISTORY_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true, resizable: false },
  {
    key: 'order',
    omitCellIcon: true,
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Order',
    type: 'id',
    align: 'start',
    frozen: true,
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'age',
    width: 'minmax(4rem, 4rem)',
    label: 'Late',
    type: 'number',
    frozen: true,
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'title',
    width: 'minmax(12rem, 12rem)',
    label: 'Product',
    type: 'text',
    frozen: true,
    resizable: true,
    labelFitRem: 8,
  },
  {
    key: 'stage',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Stage',
    type: 'tag',
    align: 'start',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'tester',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Tester',
    type: 'text',
    hideKey: 'tester',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'testedAt',
    width: 'minmax(7rem, 7rem)',
    label: 'Tested',
    type: 'date',
    hideKey: 'testedAt',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packer',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Packer',
    type: 'text',
    hideKey: 'packer',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packedAt',
    width: 'minmax(7rem, 7rem)',
    label: 'Packed',
    type: 'date',
    hideKey: 'packedAt',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packStation',
    width: 'minmax(6rem, 6rem)',
    label: 'Station',
    type: 'location',
    align: 'start',
    hideKey: 'packStation',
    tier: 'optional',
    resizable: false,
    labelFitRem: 5,
  },
  {
    key: 'urgent',
    width: 'minmax(4rem, 4rem)',
    label: 'Urgent',
    type: 'tag',
    align: 'start',
    hideKey: 'urgent',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'condition',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Cond',
    type: 'tag',
    align: 'start',
    hideKey: 'condition',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'qty',
    width: 'minmax(3.5rem, 3.5rem)',
    label: 'Qty',
    type: 'number',
    hideKey: 'qty',
    resizable: false,
    labelFitRem: 3.5,
  },
  {
    key: 'tracking',
    omitCellIcon: true,
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Tracking',
    type: 'tracking',
    hideKey: 'tracking',
    resizable: false,
    labelFitRem: 5.5,
  },
  { key: '_fill', width: 'minmax(0rem, 1fr)', resizable: false },
] as const;
