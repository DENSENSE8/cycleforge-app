/** SKU-stock manual-adjust reason vocabulary — the quick reasons on the SkuStockCard +/- adjust. */

interface SkuStockReason {
  code: string;
  label: string;
}

export const SKU_STOCK_REASONS: readonly SkuStockReason[] = [
  { code: 'RECEIVED', label: 'Received' },
  { code: 'SOLD', label: 'Sold' },
  { code: 'DAMAGED', label: 'Damaged' },
  { code: 'ADJUSTMENT', label: 'Adjustment' },
  { code: 'RETURNED', label: 'Returned' },
  { code: 'CYCLE_COUNT', label: 'Cycle count' },
];
