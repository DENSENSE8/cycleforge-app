/** The ONE rule for reading a repair's buyer. */

interface RepairContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** Row shape this reads — structural, so both `RSRecord` and the kiosk row fit. */
interface RepairContactSource {
  contact_info?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
}

const text = (value: string | null | undefined): string | null =>
  String(value ?? '').trim() || null;

/** Digits-only length a part needs before it can be read as a phone. */
const MIN_PHONE_DIGITS = 7;

/** Parse the legacy joined string WITHOUT using positions. */
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
