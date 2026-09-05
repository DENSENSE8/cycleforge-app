/**
 * What tables the product offers — as **plain data**, importable from a server
 * route.
 *
 * ## Why this is not just `REGISTERED_BINDINGS`
 *
 * The registry is the real catalog and stays the SoT, but a binding carries a
 * `makeDescriptor` and a typed column model that live beside `'use client'`
 * cells, headers and rows. Importing it from an API route drags that whole
 * component graph into the **server** bundle, where the module-init order
 * differs from the client's — and it does not survive the trip: the production
 * build failed with
 *
 *   Failed to collect page data for /api/tables/catalog
 *   ZodError: columns[5] — expected object, received function
 *
 * which is a partially-initialised module being handed to `parseTableDefinition`
 * mid-cycle. It typechecks and it passes unit tests, because both evaluate the
 * graph in the client's order; only `next build` sees it. That is exactly the
 * class of bug `npm run verify` cannot catch, and the reason the build is part
 * of the gate.
 *
 * So the route imports THIS — a list of `{ tableId, label }` with no component
 * imports at all — and `table-catalog.test.ts` asserts it names the same set as
 * `REGISTERED_BINDINGS`, so the two cannot drift. The duplication is real, and
 * it is bought deliberately: a test that fails in CI is a better guard than an
 * import that fails in a production build.
 */

/** One sheet the product offers. */
export interface ProductTable {
  tableId: string;
  label: string;
}

/**
 * The offering, in the order a new org sees it.
 *
 * Keep in lockstep with `REGISTERED_BINDINGS` — `table-catalog.test.ts` compares
 * the two sets and fails the build if they disagree. A `tableId` appears ONCE
 * even where two bindings share it (Orders' default / tested column modes are
 * one sheet in two modes).
 */
export const PRODUCT_TABLES: readonly ProductTable[] = [
  { tableId: 'receiving', label: 'Unbox · History · Testing' },
  { tableId: 'incoming', label: 'Incoming POs' },
  { tableId: 'orders', label: 'To-ship' },
  { tableId: 'daily', label: 'Daily checks' },
  { tableId: 'tasks', label: 'Tasks' },
  { tableId: 'sessions', label: 'Work sessions' },
  { tableId: 'sku-velocity', label: 'SKU velocity' },
  { tableId: 'dead-stock', label: 'Dead stock' },
  { tableId: 'catalog-link', label: 'Review · Listing match' },
  { tableId: 'import-exception', label: 'Review · Missing item number' },
  { tableId: 'inventory-units', label: 'Inventory units' },
  { tableId: 'orders-import', label: 'Order import staging' },
  { tableId: 'shortage-coverage-import', label: 'Shortage coverage import' },
  { tableId: 'ready', label: 'Recently tested units' },
  { tableId: 'catalog', label: 'Products catalog' },
  { tableId: 'pickup', label: 'Local pickup' },
  { tableId: 'unfound', label: 'Unfound queue' },
  { tableId: 'repair', label: 'Repair queue' },
  { tableId: 'tech-all', label: 'Tech · All' },
  { tableId: 'tracking-exceptions', label: 'Tracking exceptions' },
  { tableId: 'bins', label: 'Warehouse bins' },
  { tableId: 'inventory-events', label: 'Inventory ledger activity' },
  { tableId: 'audit-log', label: 'Audit log' },
  { tableId: 'auth-sessions', label: 'Active sessions' },
  { tableId: 'kiosk-devices', label: 'Kiosk devices' },
  { tableId: 'staff-directory', label: 'Team' },
  { tableId: 'ai-usage', label: 'AI usage' },
  { tableId: 'compatibility', label: 'Compatibility rules' },
  { tableId: 'warranty', label: 'Warranty claims' },
  { tableId: 'my-day', label: 'Home · Today' },
] as const;
