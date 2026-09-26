/** What is this order line worth, and is that number real? */

export type PriceSource = 'sold' | 'unit' | 'listing' | 'unknown';

export interface PriceFacts {
  saleAmount: string | number | null;      // orders.sale_amount
  currency: string | null;                 // orders.currency
  unitListingCents: number | null;         // serial_unit_listings, allocated unit
  listingCents: number | null;             // platform_listings best match
  listingPlatform: string | null;          // platform that listing came from
  orderPlatform: string | null;            // orders.account_source
}

interface ResolvedPrice {
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

/** `orders.sale_amount` is NUMERIC(12,2), and node-postgres hands NUMERIC back as a STRING to avoid the float rounding it cannot represent. */
const MONEY_TEXT = /^-?\d{1,10}(?:\.\d{1,2})?$/;

/** Money → integer cents, or null when the value is not money. */
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

/** An asking price of exactly 0 is a sync artifact, not an offer — every channel importer writes 0 for "price not set". */
function estimateCents(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.trunc(raw);
}

/** ISO-4217 is three letters; anything else on the row is noise, not a currency. */
const CURRENCY_CODE = /^[A-Z]{3}$/;

/** Precedence: realised sale → allocated unit → channel listing → nothing. */
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
    // The lateral already ranked an own-channel listing first (see PRICE_FACTS_LATERALS).
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
