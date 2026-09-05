import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import type { SkuVelocityRow } from '@/features/reports/metrics/report-rows';

export function skuVelocityCompoundView(row: SkuVelocityRow): CompoundRowView {
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
    stateLabel: row.velocity_tier,
    stateTone: row.velocity_tier === 'D' ? 'alert' : 'neutral',
    amount: null,
    delay: null,
  };
}
