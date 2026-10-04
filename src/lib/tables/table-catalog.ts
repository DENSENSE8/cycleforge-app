/** What tables the product offers — as **plain data**, importable from a server route. */

/** One sheet the product offers. */
interface ProductTable {
  tableId: string;
  label: string;
}

/** The offering, in the order a new org sees it. */
export const PRODUCT_TABLES: readonly ProductTable[] = [
  { tableId: 'orders-import', label: 'Order import staging' },
  { tableId: 'ready', label: 'Recently tested units' },
  { tableId: 'tech-all', label: 'Tech · All' },
  { tableId: 'bins', label: 'Warehouse bins' },
] as const;
