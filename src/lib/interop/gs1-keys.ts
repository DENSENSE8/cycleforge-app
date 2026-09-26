/** GS1 identification keys — what this product may and may not claim. */

/**
 * The GS1 keys this product can meaningfully talk about.
 *
 * Deliberately not the full GS1 key list — a key with no corresponding
 * Cycle Forge fact is a field someone will fill in with a guess.
 */
const GS1_KEY_TYPES = [
  /** Global Trade Item Number — the product model. `sku_catalog.gtin`. */
  'GTIN',
  /** GTIN + serial — THIS individual unit of this product. */
  'SGTIN',
  /** Serial Shipping Container Code — a specific carton/pallet in a shipment. */
  'SSCC',
  /** Global Location Number — a physical place. */
  'GLN',
  /** Global Returnable Asset Identifier — totes, crates, trays. */
  'GRAI',
  /** Global Individual Asset Identifier — owned/fixed equipment. */
  'GIAI',
] as const;

type Gs1KeyType = (typeof GS1_KEY_TYPES)[number];

/** GS1 Application Identifiers, for the keys that have one. */
const GS1_APPLICATION_IDENTIFIERS = {
  GTIN: '01',
  SSCC: '00',
  GLN: '414',
  GRAI: '8003',
  GIAI: '8004',
} as const satisfies Partial<Record<Gs1KeyType, string>>;

/** AI `(21)` — the serial half of an SGTIN. */
const GS1_AI_SERIAL = '21';

/** Prefixes GS1 itself uses in documentation, sandboxes and conformance samples. */
const PLACEHOLDER_GS1_PREFIXES = ['0614141', '9521141', '9526000'] as const;

/** True when the digits are a known GS1 example prefix rather than a licensed one. */
export function isPlaceholderGs1Prefix(prefix: string): boolean {
  const digits = prefix.replace(/\D/g, '');
  if (!digits) return true;
  return PLACEHOLDER_GS1_PREFIXES.some(
    (p) => digits === p || digits.startsWith(p),
  );
}

/** True when a GTIN sits on a placeholder company prefix. */
function isPlaceholderGtin(gtin: string): boolean {
  const digits = gtin.replace(/\D/g, '');
  if (!digits) return true;
  if (isPlaceholderGs1Prefix(digits)) return true;
  // GTIN-14 / GTIN-13 carry a leading indicator or zero-pad before the prefix.
  if (digits.length >= 13 && isPlaceholderGs1Prefix(digits.slice(1))) return true;
  return false;
}

/**
 * GS1 prefixes reserved for **Restricted Circulation Numbers** — `02` and
 * `20`–`29`. GS1 assigns these to nobody: they exist so a company can number
 * things for its own internal use.
 */
const RESTRICTED_CIRCULATION_PREFIXES = [
  '02', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
] as const;

/** True when a GTIN is a Restricted Circulation Number — internal-only, and therefore **not** a key that may leave this tenant. */
function toGtin13(digits: string): string | null {
  if (digits.length === 14) return digits.slice(1);
  if (digits.length === 13) return digits;
  if (digits.length === 12 || digits.length === 8) return digits.padStart(13, '0');
  return null;
}

export function isRestrictedCirculationGtin(gtin: string | null | undefined): boolean {
  const gtin13 = toGtin13((gtin ?? '').replace(/\D/g, ''));
  if (!gtin13) return false;
  return RESTRICTED_CIRCULATION_PREFIXES.some((p) => gtin13.startsWith(p));
}

// ─── Accepting a GTIN a human typed ─────────────────────────────────────────

/** Why a typed GTIN was refused. `null` on the accept path. */
type GtinEntryRefusal =
  | 'empty'
  | 'length'
  | 'check-digit'
  | 'placeholder'
  | 'restricted-circulation';

interface GtinEntryVerdict {
  ok: boolean;
  /** Normalised digits — non-null only when `ok`. This is what gets stored. */
  digits: string | null;
  refusal: GtinEntryRefusal | null;
  /** Operator-facing sentence. `null` when `ok`. */
  message: string | null;
}

/** The gate for a GTIN a **person** entered, as opposed to one this app minted. */
export function classifyGtinEntry(raw: string | null | undefined): GtinEntryVerdict {
  const digits = (raw ?? '').replace(/\D/g, '');

  const refuse = (refusal: GtinEntryRefusal, message: string): GtinEntryVerdict => ({
    ok: false,
    digits: null,
    refusal,
    message,
  });

  if (!digits) return refuse('empty', 'Enter a GTIN, or leave it blank for none.');

  if (![8, 12, 13, 14].includes(digits.length)) {
    return refuse(
      'length',
      `A GTIN is 8, 12, 13 or 14 digits — this is ${digits.length}.`,
    );
  }

  if (!hasValidGs1CheckDigit(digits)) {
    return refuse(
      'check-digit',
      'The check digit does not match. Re-read the last digit off the barcode.',
    );
  }

  if (isPlaceholderGtin(digits)) {
    return refuse(
      'placeholder',
      'That sits on a GS1 documentation prefix — it is an example from the spec, licensed to nobody.',
    );
  }

  if (isRestrictedCirculationGtin(digits)) {
    return refuse(
      'restricted-circulation',
      'That is an internal restricted-circulation number, which Cycle Forge assigns itself. Enter a GTIN you licensed from GS1, or clear the field to go back to the internal one.',
    );
  }

  return { ok: true, digits, refusal: null, message: null };
}

/**
 * A tenant's configured GS1 identity, resolved from `organizations.settings`.
 *
 * All fields optional because the honest answer for most tenants is "none of
 * these". Nothing downstream may invent one.
 */
export interface Gs1OrgIdentity {
  /**
   * The licensed GS1 Company Prefix. Required to MINT any key — an SSCC, a
   * GRAI and a GLN are all "company prefix + serial reference + check digit",
   * so without this there is no key to construct.
   */
  companyPrefix?: string;
  /** The tenant's own GLN, for the `bizLocation` / `where` dimension. */
  gln?: string;
  /**
   * Which CBV URI spelling this tenant's partners accept. Per-connection in
   * spirit; per-org is as fine-grained as the settings bag goes today.
   */
  cbvUriForm?: 'urn' | 'webUri';
}

/** Normalize a settings blob into an identity, dropping anything that is not a usable GS1 value. */
export function resolveGs1Identity(
  raw: Gs1OrgIdentity | null | undefined,
): Gs1OrgIdentity {
  if (!raw) return {};
  const out: Gs1OrgIdentity = {};

  const prefix = (raw.companyPrefix ?? '').replace(/\D/g, '');
  if (prefix && !isPlaceholderGs1Prefix(prefix)) out.companyPrefix = prefix;

  const gln = (raw.gln ?? '').replace(/\D/g, '');
  // A GLN is exactly 13 digits. A wrong-length value is a typo, not a GLN.
  if (gln.length === 13 && !isPlaceholderGs1Prefix(gln)) out.gln = gln;

  if (raw.cbvUriForm === 'urn' || raw.cbvUriForm === 'webUri') {
    out.cbvUriForm = raw.cbvUriForm;
  }

  return out;
}

/**
 * The mint gate. Everything that constructs a GS1 key must pass through this.
 *
 * Returns a narrowed type so the compiler — not a code review — is what stops
 * a key being built without a prefix.
 */
export function hasCompanyPrefix(
  identity: Gs1OrgIdentity,
): identity is Gs1OrgIdentity & { companyPrefix: string } {
  return typeof identity.companyPrefix === 'string' && identity.companyPrefix.length > 0;
}

/** GS1 mod-10 check digit for a numeric key, computed over all but the last digit. */
export function gs1CheckDigit(payload: string): number {
  const digits = payload.replace(/\D/g, '');
  let sum = 0;
  // Rightmost payload digit carries weight 3, then alternating.
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when a GS1 numeric key's trailing check digit is self-consistent. */
function hasValidGs1CheckDigit(key: string): boolean {
  const digits = key.replace(/\D/g, '');
  if (digits.length < 2) return false;
  const body = digits.slice(0, -1);
  const check = digits.charCodeAt(digits.length - 1) - 48;
  return gs1CheckDigit(body) === check;
}

/** True when a string is a GLN this tenant may actually assert: */
export function isLicensedGln(gln: string | null | undefined): boolean {
  const digits = (gln ?? '').replace(/\D/g, '');
  if (digits.length !== 13) return false;
  if (!hasValidGs1CheckDigit(digits)) return false;
  return !isPlaceholderGs1Prefix(digits);
}

/** True when the tenant configured a real GLN we may put in `bizLocation`. */
function hasGln(
  identity: Gs1OrgIdentity,
): identity is Gs1OrgIdentity & { gln: string } {
  return isLicensedGln(identity.gln);
}

// ─── Does this tenant need a GS1 key at all? ────────────────────────────────

/** Why a tenant is expected to hold a GTIN-capable key. */
type Gs1RequirementReason = 'new-inventory' | 'amazon';

/** How a tenant obtains GTINs — mirrors `settings.compliance.gs1Status`. */
export type Gs1SourceStatus = 'prefix' | 'per-item' | 'exempt' | 'none';

/** The two persisted answers, taken structurally so this module stays pure. */
export interface Gs1ComplianceAnswers {
  hasNewInventory?: boolean | null;
  sellsOnAmazon?: boolean | null;
  gs1Status?: Gs1SourceStatus | null;
}

interface Gs1Requirement {
  /** Both questions have an explicit answer — `false` counts, `null` does not. */
  answered: boolean;
  /** A GTIN-capable GS1 key is expected for this inventory + these channels. */
  required: boolean;
  /** Empty unless `required`. */
  reasons: Gs1RequirementReason[];
  /** `required` AND nothing usable on file. **The only state worth nagging.** */
  unmet: boolean;
}

/** Decide whether a tenant needs a licensed GS1 key, from what they told us. */
export function resolveGs1Requirement(
  answers: Gs1ComplianceAnswers | null | undefined,
  identity: Gs1OrgIdentity = {},
): Gs1Requirement {
  const hasNewInventory = answers?.hasNewInventory ?? null;
  const sellsOnAmazon = answers?.sellsOnAmazon ?? null;
  const gs1Status = answers?.gs1Status ?? null;

  const answered = typeof hasNewInventory === 'boolean' && typeof sellsOnAmazon === 'boolean';

  const reasons: Gs1RequirementReason[] = [];
  if (hasNewInventory === true) reasons.push('new-inventory');
  if (sellsOnAmazon === true) reasons.push('amazon');
  const required = reasons.length > 0;

  // A prefix claim is only met once the digits are actually on file AND survive
  // the placeholder / length refusal — claiming `'prefix'` with an empty or
  // borrowed value is exactly the state this flow exists to surface.
  const met =
    gs1Status === 'per-item' ||
    gs1Status === 'exempt' ||
    (gs1Status === 'prefix' && hasCompanyPrefix(resolveGs1Identity(identity)));

  return { answered, required, reasons, unmet: answered && required && !met };
}

/** An identifier as it will appear in a projection. */
interface InteropIdentifier {
  scheme: 'gs1' | 'internal';
  /** The GS1 key type when `scheme === 'gs1'`. */
  keyType?: Gs1KeyType;
  /** The full URI form. */
  uri: string;
  /** The bare value, for consumers that want the digits/handle alone. */
  value: string;
}

/** URI namespace for Cycle Forge's internal handles. */
const INTERNAL_URN_NAMESPACE = 'urn:cycleforge';

export type InternalEntityKind =
  | 'carton'
  | 'line'
  | 'unit'
  | 'handling-unit'
  | 'order'
  | 'sku'
  | 'location'
  | 'shipment'
  // Customer-service records. Neither is a trade item nor a logistic unit, so
  // neither can borrow an existing kind without the URN asserting something
  // false about the id it carries (a claim id is not an order id).
  | 'claim'
  | 'ticket';

/** Build an internal identifier. Always available — needs no GS1 prefix. */
export function internalIdentifier(
  kind: InternalEntityKind,
  value: string | number,
): InteropIdentifier {
  const v = String(value);
  return {
    scheme: 'internal',
    uri: `${INTERNAL_URN_NAMESPACE}:${kind}:${encodeURIComponent(v)}`,
    value: v,
  };
}

/** Build the SGTIN for a serialized unit — "this individual unit of this product", the key a reseller actually needs. */
export function sgtinIdentifier(
  gtin: string | null | undefined,
  serial: string | null | undefined,
): InteropIdentifier | null {
  const g = (gtin ?? '').replace(/\D/g, '');
  const s = (serial ?? '').trim();
  if (!g || !s) return null;
  // GTIN-8/12/13/14. Anything else is not a GTIN.
  if (![8, 12, 13, 14].includes(g.length)) return null;
  // A GTIN on GS1's documentation prefix is a sample, not a trade item.
  if (isPlaceholderGtin(g)) return null;
  // An internally-minted restricted-circulation number is real inside this
  // warehouse and meaningless outside it — see isRestrictedCirculationGtin.
  if (isRestrictedCirculationGtin(g)) return null;
  return {
    scheme: 'gs1',
    keyType: 'SGTIN',
    // The EPC "pure identity" URI form for a serialized trade item.
    uri: `urn:epc:id:sgtin:${g}.${encodeURIComponent(s)}`,
    value: `${g}.${s}`,
  };
}

/**
 * Build the class-level GTIN identifier for a product model.
 *
 * EPCIS class-level identity uses the `idpat` form for a quantity/class
 * reference. Returns `null` on a missing or malformed GTIN.
 */
export function gtinIdentifier(
  gtin: string | null | undefined,
): InteropIdentifier | null {
  const g = (gtin ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(g.length)) return null;
  if (isPlaceholderGtin(g)) return null;
  // The URI below is GS1's CANONICAL RESOLVER. A restricted-circulation number
  // will never resolve there, so emitting one as scheme:'gs1' hands a partner a
  // key it cannot look up — the one thing this module exists to refuse.
  if (isRestrictedCirculationGtin(g)) return null;
  return {
    scheme: 'gs1',
    keyType: 'GTIN',
    uri: `https://id.gs1.org/01/${g}`,
    value: g,
  };
}

/**
 * The GLN identifier for the tenant's own site, or `null`.
 *
 * There is no fallback and no default. `where` is omitted from an event
 * entirely when a tenant has not configured a GLN — see the module docblock.
 */
export function glnIdentifier(identity: Gs1OrgIdentity): InteropIdentifier | null {
  if (!hasGln(identity)) return null;
  return {
    scheme: 'gs1',
    keyType: 'GLN',
    uri: `urn:epc:id:sgln:${identity.gln}`,
    value: identity.gln,
  };
}
