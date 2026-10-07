/**
 * An order's total and where it came from — one rule for every surface that paints one.
 *
 * Precedence (Records Phase 3 §3.4.4, 2026-10-07):
 * 1. **ShipStation** — the linked ShipStation order's `orderTotal`
 *    (`shipstation_order_refs.order_total`): items + shipping + tax. A 0 with
 *    no priced item is ShipStation not knowing (a manual order), not a free
 *    sale ({@link knownShipStationTotal}).
 * 2. **Marketplace** — the order total a whole-order importer stores on the
 *    order's row (`orders.sale_amount` of a {@link WHOLE_ORDER_TOTAL_SOURCES}
 *    row: Shopify `currentTotalPriceSet`, Square `total_money`).
 * 3. **Lines** — the sum of the order's line totals, only when every line has
 *    one. Items only: no shipping, no tax.
 */

export type OrderTotalSource = 'shipstation' | 'marketplace' | 'lines';

export interface OrderTotal {
  amount: number;
  source: OrderTotalSource;
}

export interface OrderTotalInput {
  /** The linked ShipStation order's total; null when no ShipStation order is linked. */
  shipstationTotal: number | null;
  /** The linked ShipStation order has a priced (non-adjustment) item. */
  shipstationPriced: boolean;
  /** The whole-order importer's total ({@link marketplaceOrderTotalSql}); null when the importer has none. */
  marketplaceTotal: number | null;
  /** Sum of the line totals the order's lines have; null when none has one. */
  lineTotalSum: number | null;
  /** Lines of the order that have a line total. */
  pricedLines: number;
  /** Every line of the order. */
  lines: number;
}

/**
 * The account sources whose importer writes the WHOLE order's total to the
 * order's one row (`src/lib/integrations/connectors/shopify.ts`, `square.ts`);
 * every other writer's `orders.sale_amount` is a line total.
 */
export const WHOLE_ORDER_TOTAL_SOURCES = ['shopify', 'square'] as const;

/** ShipStation's order total when it is known: a 0 counts only when the order has a priced item. */
export function knownShipStationTotal(total: number | null | undefined, priced: boolean): number | null {
  if (total == null || !Number.isFinite(total)) return null;
  return total > 0 || priced ? total : null;
}

const finite = (value: number | null): value is number => value != null && Number.isFinite(value);

/** The order's total and its source; null when no source knows it. */
export function resolveOrderTotal(input: OrderTotalInput): OrderTotal | null {
  const shipstation = knownShipStationTotal(input.shipstationTotal, input.shipstationPriced);
  if (shipstation != null) return { amount: shipstation, source: 'shipstation' };
  if (finite(input.marketplaceTotal)) return { amount: input.marketplaceTotal, source: 'marketplace' };
  if (input.lines > 0 && input.pricedLines === input.lines && finite(input.lineTotalSum)) {
    return { amount: input.lineTotalSum, source: 'lines' };
  }
  return null;
}

/** The order-total cell's hover: where the number came from. `platform` is the order's platform label (`Shopify`). */
export function orderTotalSourceLabel(source: OrderTotalSource, platform: string | null): string {
  switch (source) {
    case 'shipstation':
      return 'ShipStation order total';
    case 'marketplace':
      return `${platform?.trim() || 'Marketplace'} order total`;
    case 'lines':
      return 'Sum of line totals';
  }
}

/** SQL: the whole-order importer's total on the `orders` row aliased `alias`, else NULL. */
export function marketplaceOrderTotalSql(alias: string): string {
  const sources = WHOLE_ORDER_TOTAL_SOURCES.map((source) => `'${source}'`).join(', ');
  return `CASE WHEN ${alias}.account_source IN (${sources}) THEN ${alias}.sale_amount END`;
}

/** SQL: the `shipstation_order_refs` row aliased `alias` has a priced (non-adjustment) item — the SQL face of the connector's `priced`. */
export function shipStationOrderPricedSql(alias: string): string {
  return `EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(${alias}.line_items, '[]'::jsonb)) it
                   WHERE NOT COALESCE((it->>'adjustment')::boolean, false)
                     AND (it->>'unitPrice')::numeric > 0)`;
}
