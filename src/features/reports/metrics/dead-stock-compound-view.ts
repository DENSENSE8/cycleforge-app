import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import type { DeadStockRow } from '@/features/reports/metrics/report-rows';

export function deadStockCompoundView(row: DeadStockRow): CompoundRowView {
  const title = row.product_title?.trim() || row.sku;
  return {
    id: row.sku,
    thumbUrl: null,
    title,
    note: null,
    orderId: row.sku,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: `${row.days_dormant}d`,
    stateTone: row.days_dormant >= 90 ? 'alert' : 'neutral',
    amount: null,
    delay: null,
  };
}
