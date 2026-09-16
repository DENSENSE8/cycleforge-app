/**
 * Dead-stock slot resolvers — pure.
 *
 * `last_move` resolves to the ABSOLUTE INSTANT, never a pre-formatted or
 * relative face: the engine turns a `date` display type into the cell face and
 * keeps the instant behind it, and a resolver whose text depended on `now`
 * would sort and search differently on every render.
 *
 * Numbers resolve to their DIGITS, not to a formatted face — the engine
 * compares `number` tracks with `Number(text)`, so a `'184d'` here would sort
 * the column lexically while looking right on screen. The `d` suffix belongs
 * to the pill's WORD (`report-dead-stock-row-view.ts`), not to the fact.
 *
 * A never-moved SKU resolves `days_dormant` to null TEXT rather than to `0`:
 * the route selects `NULL::int` for it, "no ledger write at all" is not "zero
 * days dormant", and the engine's blank rule then sinks those rows under both
 * sort directions — which is what the route's `NULLS LAST` already did.
 */

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
