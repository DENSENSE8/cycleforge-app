/**
 * What is this order line worth, and is that number real?
 *
 * ## Why a resolver and not a column
 *
 * There are THREE price facts in this schema and they are not the same number:
 *
 *   - `platform_listings.listing_price_cents` — what we ASK for the SKU, per
 *     channel, right now. Changes every time a lister repriced.
 *   - `orders.sale_amount` — what the buyer actually PAID on this line. Frozen
 *     at checkout; the only figure revenue may be computed from.
 *   - `serial_unit_listings.listing_price_cents` — what we ask for ONE specific
 *     serialized box (a graded unit priced away from its SKU).
 *
 * Collapsing them into a single `price` column would make a repriced listing
 * rewrite historical revenue, and make a historical sale misreport today's
 * ask. So they stay three columns, and this module decides which one a desk
 * gets to see — plus `isEstimate`, so the surface can say "≈" instead of
 * quietly presenting an ask as a sale.
 *
 * ## Why an estimate at all
 *
 * Measured 2026-09-15 on live prod: 6 of 4467 orders carry `sale_amount`
 * (0.1%) — every importer writes null. 1557 `platform_listings` rows are all
 * priced. Waiting for the importers to backfill means every desk shows a dash
 * today; refusing the listing price means the same. A labelled estimate is the
 * only answer that is both useful and honest.
 *
 * Pure module: no I/O, no DB. The SQL that gathers {@link PriceFacts} lives in
 * `lib/neon/orders-queries.ts` (`PRICE_FACTS_LATERALS`).
 */

export type PriceSource = 'sold' | 'unit' | 'listing' | 'unknown';

export interface PriceFacts {
  saleAmount: string | number | null;      // orders.sale_amount
  currency: string | null;                 // orders.currency
  unitListingCents: number | null;         // serial_unit_listings, allocated unit
  listingCents: number | null;             // platform_listings best match
  listingPlatform: string | null;          // platform that listing came from
  orderPlatform: string | null;            // orders.account_source
}

export interface ResolvedPrice {
  cents: number | null;
  currency: string;                        // defaults 'USD' when unknown
  source: PriceSource;
  platform: string | null;                 // which platform priced it, null for 'sold'
  /** true when the number is an ESTIMATE from a listing, not realised revenue */
  isEstimate: boolean;
}

const DEFAULT_CURRENCY = 'USD';

const UNPRICED: ResolvedPrice = {
  cents: null,
  currency: DEFAULT_CURRENCY,
  source: 'unknown',
  platform: null,
  isEstimate: false,
};

/**
 * `orders.sale_amount` is NUMERIC(12,2), and node-postgres hands NUMERIC back
 * as a STRING to avoid the float rounding it cannot represent. Ten integer
 * digits max keeps `whole * 100` inside Number.MAX_SAFE_INTEGER, so the cents
 * arithmetic below is exact rather than merely close.
 */
const MONEY_TEXT = /^-?\d{1,10}(?:\.\d{1,2})?$/;

/**
 * Money → integer cents, or null when the value is not money.
 *
 * Deliberately NOT `Math.round(parseFloat(x) * 100)`: `parseFloat` accepts
 * `"19.00 USD"`, `"$19"` and `"abc"`→NaN, and NaN round-trips to 0 through
 * `Math.round`. A garbage sale_amount must read as "no price known", never as
 * a free order — so the shape is validated first and the fraction is padded to
 * two digits and added as an integer, which never drifts.
 */
function moneyToCents(raw: string | number | null): number | null {
  if (raw == null) return null;
  // A caller that already parsed the NUMERIC (or a pg type-parser override)
  // hands us a float; its precision is spent, so rounding is the best left.
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }
  const text = raw.trim();
  if (!MONEY_TEXT.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/**
 * An asking price of exactly 0 is a sync artifact, not an offer — every
 * channel importer writes 0 for "price not set". Realised revenue of 0 is a
 * different claim (a $0 replacement order really happened), so this floor
 * applies only to the two estimate arms.
 */
function estimateCents(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.trunc(raw);
}

/** ISO-4217 is three letters; anything else on the row is noise, not a currency. */
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Precedence: realised sale → allocated unit → channel listing → nothing.
 *
 * The unit beats the SKU listing because an allocation names the exact box
 * leaving the building; a unit priced away from its SKU was priced away for a
 * reason (grade, damage, bundle), and the SKU ask would overwrite that
 * judgement.
 *
 * A malformed `saleAmount` falls THROUGH to the estimates rather than
 * short-circuiting to `unknown`: the row claims revenue we cannot read, which
 * is exactly the case where a labelled estimate beats a blank cell. With no
 * estimate available it lands on `unknown` with null cents — never 0.
 */
export function resolveLinePrice(facts: PriceFacts): ResolvedPrice {
  const code = String(facts.currency ?? '').trim().toUpperCase();
  const currency = CURRENCY_CODE.test(code) ? code : DEFAULT_CURRENCY;

  const sold = moneyToCents(facts.saleAmount);
  if (sold != null) {
    return { cents: sold, currency, source: 'sold', platform: null, isEstimate: false };
  }

  const unit = estimateCents(facts.unitListingCents);
  if (unit != null) {
    // `platform` stays null: PriceFacts carries no platform for the unit arm,
    // and the allocated unit's price applies to that box whatever channel
    // listed it. Naming the ORDER's channel here would invent provenance.
    return { cents: unit, currency, source: 'unit', platform: null, isEstimate: true };
  }

  const listing = estimateCents(facts.listingCents);
  if (listing != null) {
    // The lateral already ranked an own-channel listing first (see
    // PRICE_FACTS_LATERALS). Whatever it picked is reported with ITS OWN
    // platform, never rewritten to the order's — a desk must be able to read
    // "≈ from ecwid" on an eBay line and distrust it accordingly.
    return {
      cents: listing,
      currency,
      source: 'listing',
      platform: facts.listingPlatform?.trim() || null,
      isEstimate: true,
    };
  }

  return currency === DEFAULT_CURRENCY ? UNPRICED : { ...UNPRICED, currency };
}
