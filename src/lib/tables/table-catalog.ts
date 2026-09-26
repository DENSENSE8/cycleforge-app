/** What tables the product offers — as **plain data**, importable from a server route. */

/** One sheet the product offers. */
interface ProductTable {
  tableId: string;
  label: string;
}

/** The offering, in the order a new org sees it. */
export const PRODUCT_TABLES: readonly ProductTable[] = [
  { tableId: 'receiving', label: 'Unbox · History · Testing' },
  { tableId: 'orders', label: 'To-ship' },
  { tableId: 'daily', label: 'Daily checks' },
  { tableId: 'tasks', label: 'My tasks' },
  { tableId: 'catalog-link', label: 'Review · Listing match' },
  { tableId: 'import-exception', label: 'Review · Missing item number' },
  { tableId: 'inventory-units', label: 'Inventory units' },
  { tableId: 'orders-import', label: 'Order import staging' },
  { tableId: 'ready', label: 'Recently tested units' },
  { tableId: 'catalog', label: 'Products catalog' },
  { tableId: 'pickup', label: 'Local pickup' },
  { tableId: 'unfound', label: 'Unfound queue' },
  { tableId: 'repair', label: 'Repair queue' },
  { tableId: 'tech-all', label: 'Tech · All' },
  { tableId: 'tracking-exceptions', label: 'Tracking exceptions' },
  { tableId: 'bins', label: 'Warehouse bins' },
  { tableId: 'inventory-events', label: 'Inventory ledger activity' },
  { tableId: 'warranty', label: 'Warranty claims' },
  { tableId: 'my-day', label: 'Home · Today' },
  { tableId: 'kiosk-devices', label: 'Kiosk devices' },
  { tableId: 'kiosk-slot-events', label: 'Kiosk slot history' },
  { tableId: 'walk-in-sales', label: 'Sales · Walk-in' },
  { tableId: 'tech', label: 'Tech bench history' },
  { tableId: 'packer', label: 'Packer bench history' },
  { tableId: 'auth-sessions', label: 'Active sessions' },
  { tableId: 'cycle-counts', label: 'Inventory · Cycle counts' },
  { tableId: 'admin-returns', label: 'Returns dock' },
  { tableId: 'part-compatibility', label: 'Sourcing · Compatibility' },
  { tableId: 'unit-allocations', label: 'Unit · Order allocations' },
  { tableId: 'unit-tsn-links', label: 'Unit · TSN links' },
  { tableId: 'audit-log', label: 'Audit log' },
  { tableId: 'admin-holds', label: 'Inventory · Holds' },
  { tableId: 'admin-bulk-allocate', label: 'Inventory · Bulk allocate' },
  { tableId: 'cycle-count-lines', label: 'Inventory · Cycle count lines' },
  { tableId: 'admin-drift-alerts', label: 'Inventory · Open drift alerts' },
  { tableId: 'admin-sku-drift', label: 'Inventory · SKU stock drift' },
  { tableId: 'staff-directory', label: 'Team directory' },
  { tableId: 'report-bin-utilization', label: 'Reports · Bin utilization' },
  { tableId: 'report-velocity', label: 'Reports · Velocity (30d)' },
   { tableId: 'report-dead-stock', label: 'Reports · Dead stock (90d+)' },
  { tableId: 'report-staff-day', label: 'Reports · Staff day' },
  { tableId: 'report-packer-day', label: 'Reports · Packer day' },
  { tableId: 'report-tasks', label: 'Reports · Completed tasks' },
  { tableId: 'sku-bins', label: 'SKU · Bin distribution' },
  { tableId: 'sku-ledger', label: 'SKU · Stock ledger' },
  { tableId: 'sku-allocations', label: 'SKU · Open allocations' },
  { tableId: 'search-hits', label: 'Search · Results' },
] as const;
