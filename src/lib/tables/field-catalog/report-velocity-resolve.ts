/**
 * SKU-velocity slot resolvers — pure.
 *
 * `last_move` resolves to the ABSOLUTE INSTANT, never a pre-formatted or
 * relative face: the engine turns a `date` display type into the cell face and
 * keeps the instant behind it, and a resolver whose text depended on `now`
 * would sort and search differently on every render.
 *
 * Numbers resolve to their DIGITS, not to a formatted face — the engine
 * compares `number` tracks with `Number(text)`, so a thousands separator here
 * would sort the column lexically while looking right on screen.
 *
 * `current_stock` is nullable (the velocity CTE `LEFT JOIN`s `sku_stock`), and
 * a null resolves to null TEXT rather than to `0`: the retired cell printed
 * `Number(r.current_stock ?? 0)`, which claimed a SKU with no stock row holds
 * zero units. "We have no stock row for this SKU" and "we hold none" are
 * different answers, and the honest empty face is the one the slot cell paints
 * for the first.
 */

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
