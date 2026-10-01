import type { RecordStateFace } from './record';

/** Where a (location, SKU) stock pair stands — Inventory › Stock. */
export type StockStage = 'inStock' | 'outOfStock' | 'onHold';

/**
 * Inventory › Stock — the shelf's own states, not the outbound order lifecycle
 * (an order's "To pick" is not a shelf's "In stock"). Same shape as
 * `QC_LABEL_LIFECYCLE`: one badge component (`LifecycleCode`) reads either.
 */
export const STOCK_LIFECYCLE: Readonly<Record<StockStage, RecordStateFace>> = {
  inStock: { id: 'inStock', code: 'STK', label: 'In stock', tone: 'info', icon: 'circle-dot' },
  outOfStock: { id: 'outOfStock', code: 'OOS', label: 'Out of stock', tone: 'danger', icon: 'package-x', hatched: true },
  // A floor-minted placeholder SKU (`TMP-…`) waiting to be paired to its Zoho item.
  onHold: { id: 'onHold', code: 'HLD', label: 'On hold', tone: 'warning', icon: 'circle-pause' },
};
