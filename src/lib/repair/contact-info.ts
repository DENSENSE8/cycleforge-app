/**
 * The ONE rule for reading a repair's buyer.
 *
 * Callers: `render-repair-paper`, `read-repair-ticket`, `square-payment-link`,
 * the repair field catalog, `RepairPickupFlow`, `RepairInfoSections`.
 * Affected API: none — pure. Data schemas: `repair_service.contact_info` plus
 * the `customers` columns `getRepairById` / `read-repair-ticket` already join
 * (`customer_name` / `customer_phone` / `customer_email`).
 *
 * ## Why this is a module and not six local helpers
 *
 * `contact_info` is written as `[name, phone, email].filter(Boolean).join(', ')`.
 * `filter(Boolean)` is the whole problem: the index of every part depends on
 * which parts EXIST. A buyer with no phone stores `"Jane, jane@x.com"`, so
 * every `parts[1]` in this repo read an EMAIL as the phone — and then handed it
 * to `formatPhoneNumber`, to a Square `e164_phone_number` field, and onto
 * printed paper. A name containing a comma shifts everything behind it.
 *
 * Six sites carried six copies of that positional read. Fixing them one at a
 * time is how three of them silently drifted back.
 *
 * ## The rule
 *
 * 1. The JOINED `customers` row wins. It is live — an operator correcting a
 *    phone on the customer record reaches every surface. `contact_info` is a
 *    frozen intake string nobody re-writes.
 * 2. The fallback is INDEX-FREE: the email is the part with an `@`, the phone
 *    is the part that is mostly digits, the name is what is left. A missing
 *    field can no longer shift the two behind it.
 * 3. Unknown is `null`, never `''` and never `'Walk-in'` — asserting an intake
 *    channel on a ticket whose channel is `shipment` makes the name row
 *    contradict the chip above it.
 *
 * As of 2026-09-23 every `repair_service` row carrying a non-empty
 * `contact_info` also carries a `customer_id` (81/81), so tier 1 answers in
 * practice and tier 2 is genuinely a legacy path.
 */

export interface RepairContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** Row shape this reads — structural, so both `RSRecord` and the kiosk row fit. */
export interface RepairContactSource {
  contact_info?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
}

const text = (value: string | null | undefined): string | null =>
  String(value ?? '').trim() || null;

/** Digits-only length a part needs before it can be read as a phone. */
const MIN_PHONE_DIGITS = 7;

/**
 * Parse the legacy joined string WITHOUT using positions.
 *
 * Exported for the surfaces that hold only the string (and for the reader who
 * wants to see the rule); prefer {@link resolveRepairContact} when the row's
 * joined customer columns are in hand.
 */
export function parseLegacyContactInfo(raw: string | null | undefined): RepairContact {
  const parts = String(raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const email = parts.find((part) => part.includes('@')) ?? null;
  const phone =
    parts.find(
      (part) => part !== email && part.replace(/\D/g, '').length >= MIN_PHONE_DIGITS,
    ) ?? null;
  // Whatever is neither. Joined back so a name that contained a comma survives
  // as one name instead of being truncated at the first segment.
  const name = parts.filter((part) => part !== email && part !== phone).join(', ') || null;

  return { name, phone, email };
}

/** The buyer: joined `customers` row first, legacy string only to fill blanks. */
export function resolveRepairContact(row: RepairContactSource): RepairContact {
  const name = text(row.customer_name);
  const phone = text(row.customer_phone);
  const email = text(row.customer_email);

  // Parse only when something is actually missing — the common row is linked.
  if (name && phone && email) return { name, phone, email };

  const legacy = parseLegacyContactInfo(row.contact_info);
  return {
    name: name ?? legacy.name,
    phone: phone ?? legacy.phone,
    email: email ?? legacy.email,
  };
}
