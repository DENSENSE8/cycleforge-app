/**
 * The customer book's display contract — one DTO and one set of readers for
 * every surface that shows a `customers` row.
 *
 * `GET /api/customers/[id]` returns this row, and `/api/orders` joins the same
 * columns onto each order as `customer` (`orders.customer_id → customers`,
 * org-scoped), so the To-ship ledger row and its evidence column read the book
 * without a fetch per row. `CustomerDetailsTab` reads the same helpers; a
 * surface that needs a customer's name or address calls these, never a local
 * `display_name || customer_name || …` chain.
 */

/**
 * ShipStation's `billTo`, as the buyer writer stores it in
 * `customers.billing_address` (written only when blank). Any key may be absent.
 */
export interface CustomerBillTo {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
}

export interface CustomerRecord {
  id: number;
  display_name: string | null;
  customer_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  shipping_address_1: string | null;
  shipping_address_2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  /** `{}` when the writer had no bill-to; see {@link customerBillToLines}. */
  billing_address?: CustomerBillTo | null;
  created_at?: string | null;
}

/** The `customers` columns behind {@link CustomerRecord}, in DTO order. */
export const CUSTOMER_DISPLAY_COLUMNS = [
  'id',
  'display_name',
  'customer_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'mobile',
  'shipping_address_1',
  'shipping_address_2',
  'shipping_city',
  'shipping_state',
  'shipping_postal_code',
  'shipping_country',
  'billing_address',
  'created_at',
] as const satisfies readonly (keyof CustomerRecord)[];

/**
 * SQL for one joined customer as a {@link CustomerRecord} JSON object, NULL
 * when the join found no row. `alias` is the joined `customers` table alias.
 */
export function customerDisplayJsonSql(alias: string): string {
  const pairs = CUSTOMER_DISPLAY_COLUMNS.map((col) => `'${col}', ${alias}.${col}`).join(', ');
  return `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE jsonb_build_object(${pairs}) END`;
}

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/** Display name: display → customer → first + last. Empty string when none. */
export function customerFullName(c: CustomerRecord): string {
  return (
    clean(c.display_name) || clean(c.customer_name) || [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ')
  );
}

/** Phone, falling back to mobile. Empty string when neither. */
export function customerPhone(c: CustomerRecord): string {
  return clean(c.phone) || clean(c.mobile);
}

function postalLines(parts: {
  line1: string | null | undefined;
  line2: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  postal: string | null | undefined;
  country: string | null | undefined;
}): string[] {
  const street = [clean(parts.line1), clean(parts.line2)].filter(Boolean).join(', ');
  const cityLine = [clean(parts.city), clean(parts.state), clean(parts.postal)].filter(Boolean).join(' ');
  return [street, cityLine, clean(parts.country)].filter(Boolean);
}

/** Ship-to address: street, city line, country — blank lines dropped. */
export function customerAddressLines(c: CustomerRecord): string[] {
  return postalLines({
    line1: c.shipping_address_1,
    line2: c.shipping_address_2,
    city: c.shipping_city,
    state: c.shipping_state,
    postal: c.shipping_postal_code,
    country: c.shipping_country,
  });
}

/**
 * Bill-to address lines, or `[]` when the book has none or it is the ship-to
 * address — a second copy of the same address is noise, not a fact.
 */
export function customerBillToLines(c: CustomerRecord): string[] {
  const b = c.billing_address;
  if (!b || typeof b !== 'object') return [];
  const lines = postalLines({
    line1: b.address1,
    line2: b.address2,
    city: b.city,
    state: b.state,
    postal: b.postalCode,
    country: b.country,
  });
  if (lines.length === 0) return [];
  const ship = customerAddressLines(c);
  const same = lines.length === ship.length && lines.every((line, i) => line.toLowerCase() === ship[i].toLowerCase());
  return same ? [] : lines;
}

/**
 * The compact WHERE for a row: `City, ST` — the country joins only when it is
 * not the US (the floor ships domestic; a foreign destination is the news).
 */
export function customerPlace(c: CustomerRecord): string {
  const country = clean(c.shipping_country);
  const domestic = !country || /^(us|usa|united states)$/i.test(country);
  return [clean(c.shipping_city), clean(c.shipping_state), domestic ? '' : country].filter(Boolean).join(', ');
}
