/**
 * Write side of an order line's SOLD price (`orders.sale_amount`).
 *
 * ## Why this exists
 *
 * Three price facts, three homes, and this module owns exactly one of them:
 * the price a line ACTUALLY SOLD FOR. The asking price per platform lives on
 * `platform_listings.listing_price_cents`; the price of one serial unit lives
 * on `serial_unit_listings.listing_price_cents`. Collapsing them into a single
 * "price" would let a repriced listing overwrite historical revenue and lie
 * about both, so a correction typed by an operator lands here and nowhere else.
 *
 * ## The load-bearing decision: `orders` is LINE-grained
 *
 * `orders.order_id` is the MARKETPLACE order number and it REPEATS — one row
 * per line. Live data (org USAV, 2026-09-15) has 277 order numbers spanning
 * two or more rows. So "set the price for order 12-3456" is not a well-formed
 * instruction, and the two tempting fixes are both data corruption:
 *
 *   - writing the amount onto every line multiplies that order's revenue by
 *     its line count in every report that SUMs `sale_amount`;
 *   - dividing it across the lines invents a per-line split the operator
 *     never stated (lines are not equal-priced, and qty runs up to 20).
 *
 * So an order number that fans out to more than one line is REFUSED (409) and
 * the candidate lines come back for the caller to choose from. The numeric
 * `orders.id` — one line, no ambiguity — is the form a table row edit sends.
 *
 * ## Money is integers in, decimal string out
 *
 * Callers speak cents (integers, exact). `sale_amount` is NUMERIC(12,2), so
 * the write is a decimal STRING built by integer arithmetic. Sending a float
 * would push binary rounding into a column that exists precisely to avoid it.
 *
 * `null` clears the price back to unknown, which is meaningfully different
 * from 0: a mistyped price must be erasable, and a genuinely free replacement
 * order really did sell for 0. Hence 0 is accepted only when explicitly sent
 * and never substituted for an unparseable input.
 *
 * Collaborators are injected (real impls by default) so the semantics above
 * unit-test DB-free — see set-order-price.test.ts.
 */

import type { OrgId } from '@/lib/tenancy/constants';

/** One `orders` row, enough for the caller to disambiguate a multi-line order. */
export interface OrderPriceLine {
  id: number;
  sku: string | null;
  productTitle: string | null;
  /** NUMERIC comes back as a string — never widened to a float. */
  saleAmount: string | null;
  currency: string | null;
}

export interface SetOrderPriceArgs {
  organizationId: OrgId;
  /** The numeric `orders.id` — exactly one line. Mutually exclusive with `orderNumber`. */
  orderId?: number | null;
  /** The marketplace order number (`orders.order_id`). May fan out to many lines. */
  orderNumber?: string | null;
  /** Integer cents, or `null` to clear the price back to unknown. */
  priceCents: number | null;
  /** ISO code; omitted/null leaves the row's existing currency untouched. */
  currency?: string | null;
}

export type SetOrderPriceFailure =
  /** Neither or both identities supplied — there is no defensible precedence. */
  | { ok: false; status: 400; reason: 'identity_required'; error: string }
  | { ok: false; status: 400; reason: 'invalid_price'; error: string }
  | { ok: false; status: 404; reason: 'not_found'; error: string }
  /** The order number spans several lines; the caller must name one. */
  | { ok: false; status: 409; reason: 'ambiguous_order_number'; error: string; lines: OrderPriceLine[] };

export type SetOrderPriceResult =
  | {
      ok: true;
      status: 200;
      orderId: number;
      orderNumber: string | null;
      before: { saleAmount: string | null; currency: string | null };
      after: { saleAmount: string | null; currency: string | null };
    }
  | SetOrderPriceFailure;

/** Injectable collaborators (real impls by default; fakes in tests). */
export interface SetOrderPriceDeps {
  /** Every `orders` line matching the identity, org-scoped, ordered by id. */
  findLines: (args: {
    organizationId: OrgId;
    orderId: number | null;
    orderNumber: string | null;
  }) => Promise<Array<OrderPriceLine & { orderNumber: string | null }>>;
  /**
   * Write `sale_amount` on ONE line. `currency: null` means leave it alone —
   * clearing an amount must not wipe the channel's currency. Resolves to the
   * post-write row, or `null` when the row vanished under a concurrent delete.
   */
  writeSaleAmount: (args: {
    organizationId: OrgId;
    orderId: number;
    saleAmount: string | null;
    currency: string | null;
  }) => Promise<OrderPriceLine | null>;
}

const defaultDeps: SetOrderPriceDeps = {
  // Imported lazily: `@/lib/tenancy/db` constructs the Neon pool at module
  // load, which would make this whole module unimportable under `node:test`.
  findLines: async ({ organizationId, orderId, orderNumber }) => {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    // Branch on the identity rather than an "IS NULL OR" predicate: a bug that
    // dropped both would otherwise select the org's entire order book.
    const byId = orderId !== null;
    const { rows } = await tenantQuery<{
      id: number;
      order_id: string | null;
      sku: string | null;
      product_title: string | null;
      sale_amount: string | null;
      currency: string | null;
    }>(
      organizationId,
      `SELECT id, order_id, sku, product_title, sale_amount::text AS sale_amount, currency
         FROM orders
        WHERE organization_id = $1
          AND ${byId ? 'id = $2::int' : 'order_id = $2::text'}
        ORDER BY id`,
      [organizationId, byId ? orderId : orderNumber],
    );
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_id,
      sku: row.sku,
      productTitle: row.product_title,
      saleAmount: row.sale_amount,
      currency: row.currency,
    }));
  },
  writeSaleAmount: async ({ organizationId, orderId, saleAmount, currency }) => {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    const { rows } = await tenantQuery<{
      id: number;
      sku: string | null;
      product_title: string | null;
      sale_amount: string | null;
      currency: string | null;
    }>(
      organizationId,
      `UPDATE orders
          SET sale_amount = $1::numeric,
              currency = COALESCE($2::text, currency)
        WHERE id = $3
          AND organization_id = $4
      RETURNING id, sku, product_title, sale_amount::text AS sale_amount, currency`,
      [saleAmount, currency, orderId, organizationId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      sku: row.sku,
      productTitle: row.product_title,
      saleAmount: row.sale_amount,
      currency: row.currency,
    };
  },
};

/**
 * Integer cents → a NUMERIC(12,2)-safe decimal string. Integer arithmetic only:
 * `cents / 100` as a float already loses 5 → '0.05' at some magnitudes.
 */
export function centsToSaleAmount(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return `${whole}.${String(remainder).padStart(2, '0')}`;
}

export async function setOrderPrice(
  args: SetOrderPriceArgs,
  deps: SetOrderPriceDeps = defaultDeps,
): Promise<SetOrderPriceResult> {
  const orderId = args.orderId ?? null;
  const orderNumber = args.orderNumber?.trim() || null;

  if ((orderId === null) === (orderNumber === null)) {
    return {
      ok: false,
      status: 400,
      reason: 'identity_required',
      error: 'Supply exactly one of orderId (one line) or orderNumber (the marketplace order).',
    };
  }
  if (orderId !== null && (!Number.isInteger(orderId) || orderId <= 0)) {
    return { ok: false, status: 400, reason: 'identity_required', error: 'orderId must be a positive integer.' };
  }

  const { priceCents } = args;
  if (priceCents !== null) {
    if (!Number.isInteger(priceCents)) {
      return { ok: false, status: 400, reason: 'invalid_price', error: 'priceCents must be a whole number of cents.' };
    }
    if (priceCents < 0) {
      return { ok: false, status: 400, reason: 'invalid_price', error: 'priceCents cannot be negative.' };
    }
  }

  const lines = await deps.findLines({ organizationId: args.organizationId, orderId, orderNumber });
  if (lines.length === 0) {
    return { ok: false, status: 404, reason: 'not_found', error: 'No order line matches that identity.' };
  }
  if (lines.length > 1) {
    return {
      ok: false,
      status: 409,
      reason: 'ambiguous_order_number',
      error: `Order ${orderNumber} has ${lines.length} lines — set the price on a specific line (orderId).`,
      lines: lines.map(({ id, sku, productTitle, saleAmount, currency }) => ({
        id,
        sku,
        productTitle,
        saleAmount,
        currency,
      })),
    };
  }

  const line = lines[0];
  const saleAmount = priceCents === null ? null : centsToSaleAmount(priceCents);
  const currency = args.currency?.trim().toUpperCase() || null;

  const written = await deps.writeSaleAmount({
    organizationId: args.organizationId,
    orderId: line.id,
    saleAmount,
    currency,
  });
  if (!written) {
    return { ok: false, status: 404, reason: 'not_found', error: 'Order line disappeared before the write landed.' };
  }

  return {
    ok: true,
    status: 200,
    orderId: line.id,
    orderNumber: line.orderNumber,
    before: { saleAmount: line.saleAmount, currency: line.currency },
    after: { saleAmount: written.saleAmount, currency: written.currency },
  };
}
