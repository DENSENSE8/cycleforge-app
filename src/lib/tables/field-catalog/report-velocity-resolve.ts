/** SKU-velocity slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { VelocityReportRow } from '@/lib/reports/report-rows';

export function resolveReportVelocitySlotValue(
  row: VelocityReportRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'report-velocity.sku':
      return { kind: 'value', text: row.sku };
    case 'report-velocity.product':
      return { kind: 'value', text: row.product_title };
    case 'report-velocity.tier':
      return { kind: 'value', text: row.velocity_tier };
    case 'report-velocity.out_qty':
      return { kind: 'value', text: String(row.out_qty) };
    case 'report-velocity.in_qty':
      return { kind: 'value', text: String(row.in_qty) };
    case 'report-velocity.stock':
      return {
        kind: 'value',
        text: row.current_stock === null ? null : String(row.current_stock),
      };
    case 'report-velocity.last_move':
      return { kind: 'value', text: row.last_move_at };
    default:
      return null;
  }
}
