/** Dead-stock slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { DeadStockReportRow } from '@/lib/reports/report-rows';

export function resolveReportDeadStockSlotValue(
  row: DeadStockReportRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'report-dead-stock.sku':
      return { kind: 'value', text: row.sku };
    case 'report-dead-stock.product':
      return { kind: 'value', text: row.product_title };
    case 'report-dead-stock.stock':
      return { kind: 'value', text: String(row.stock) };
    case 'report-dead-stock.days_dormant':
      return {
        kind: 'value',
        text: row.days_dormant === null ? null : String(row.days_dormant),
      };
    case 'report-dead-stock.last_move':
      return { kind: 'value', text: row.last_move_at };
    default:
      return null;
  }
}
