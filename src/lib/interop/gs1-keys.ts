/**
 * GS1 identification keys — what this product may and may not claim.
 *
 * Pure and client-safe. This module is deliberately more about REFUSAL than
 * about minting: its most load-bearing export is `hasCompanyPrefix()`, which
 * makes it impossible to construct a GS1 key for a tenant that has not
 * configured a real GS1 Company Prefix.
 *
 * ## Why the refusal is the feature
 *
 * A GS1 key without a real Company Prefix is not a GS1 key. Emitting one is a
 * compliance claim the tenant cannot back, and — worse — the digits belong to
 * whichever company actually licensed that prefix, so a partner's system reads
 * it as a collision against a real trade item. That is strictly worse than
 * emitting nothing: EPCIS, EDI 856 and the EU DPP all tolerate an ABSENT
 * optional identifier, and none tolerate a wrong one.
 *
 * ## This is not hypothetical in this repo
 *
 * `DEFAULT_GLN` in `@/lib/barcode-routing` is `0614141000005` — GS1's own
 * documentation placeholder, on the `0614141` example prefix — and it is
 * printed on warehouse bin labels today via `gs1LocationAi()`. It is fine on
 * an internal sticker that only this app's scan router reads. It must never
 * reach an interop projection, where a partner would resolve it against the
 * real licensee. `isPlaceholderGs1Prefix()` exists to catch exactly that, and
 * `resolveGs1Identity()` refuses any prefix it matches.
 */

/**
 * The GS1 keys this product can meaningfully talk about.
 *
 * Deliberately not the full GS1 key list — a key with no corresponding
 * Cycle Forge fact is a field someone will fill in with a guess.
 */
export const GS1_KEY_TYPES = [
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

export type Gs1KeyType = (typeof GS1_KEY_TYPES)[number];

/**
 * GS1 Application Identifiers, for the keys that have one.
 *
 * SGTIN has no AI of its own — it is carried as the AI `(01)` GTIN plus the
 * AI `(21)` serial, which is why it is absent here rather than assigned a
 * made-up value.
 */
export const GS1_APPLICATION_IDENTIFIERS = {
  GTIN: '01',
  SSCC: '00',
  GLN: '414',
  GRAI: '8003',
  GIAI: '8004',
} as const satisfies Partial<Record<Gs1KeyType, string>>;

/** AI `(21)` — the serial half of an SGTIN. */
export const GS1_AI_SERIAL = '21';

/**
 * Prefixes GS1 itself uses in documentation, sandboxes and conformance
 * samples. A tenant that pasted one of these into settings has copied an
 * example, not licensed a prefix.
 *
 * `0614141` is GS1 US's documentation prefix and is the one already sitting
 * in this repo's `DEFAULT_GLN`. `9521141` / `9526000` are the GS1 Global
 * Office sample prefixes that appear throughout the Digital Link and EPCIS
 * specifications.
 */
export const PLACEHOLDER_GS1_PREFIXES = ['0614141', '9521141', '9526000'] as const;

/** True when the digits are a known GS1 example prefix rather than a licensed one. */
export function isPlaceholderGs1Prefix(prefix: string): boolean {
  const digits = prefix.replace(/\D/g, '');
  if (!digits) return true;
  return PLACEHOLDER_GS1_PREFIXES.some(
    (p) => digits === p || digits.startsWith(p),
  );
}

/**
 * True when a GTIN sits on a placeholder company prefix.
 *
 * A plain prefix check is not enough for a GTIN-14: its first digit is the
 * packaging-level INDICATOR, and the company prefix starts at digit two. So
 * `10614141000002` is a documentation GTIN that a naive `startsWith('0614141')`
 * would wave through. Both alignments are checked.
 */
export function isPlaceholderGtin(gtin: string): boolean {
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

/**
 * True when a GTIN is a Restricted Circulation Number — internal-only, and
 * therefore **not** a key that may leave this tenant.
 *
 * ## Why this exists, and why it is not the same as a placeholder
 *
 * This app MINTS these. `src/lib/inventory/internal-gtin.ts` lazily stamps
 * `"02" + 11-digit sku_catalog.id + check digit` onto `sku_catalog.gtin` the
 * first time a unit label needs one, precisely so a tenant with no GS1
 * membership still gets a scannable, check-digit-valid product number. That is
 * correct and stays — inside the warehouse an RCN is exactly the right tool.
 *
 * It is wrong the moment it crosses a tenant boundary, and the failure differs
 * from the placeholder case in a way worth keeping straight:
 *
 *  - A **placeholder** prefix (`0614141`) belongs to someone else, so emitting
 *    it is a false identity claim that can collide with a real licensee.
 *  - An **RCN** collides with nobody — the range exists so it cannot. What it
 *    falsely claims is *global resolvability*. `gtinIdentifier` renders a GTIN
 *    as `https://id.gs1.org/01/{gtin}`, GS1's canonical resolver; an RCN will
 *    never resolve there. A partner filtering on `scheme: 'gs1'` — the entire
 *    purpose of that field — would be handed a number it cannot look up.
 *
 * Both end at the same verdict (omit the key), for different reasons. Kept as
 * two predicates rather than one so the reason survives, and because a future
 * caller may legitimately want to accept an RCN for an internal-only surface.
 *
 * ## The prefix is read in GTIN-13 space, and that is load-bearing
 *
 * Every length is normalised to 13 digits BEFORE the prefix is examined, rather
 * than testing the raw string at two alignments the way `isPlaceholderGtin`
 * does. That shortcut is safe for a 7-digit documentation prefix and **wrong**
 * here, because these prefixes are two digits:
 *
 *  - A GTIN-14's leading digit is the packaging INDICATOR, legally `1`–`8` for
 *    any trade item. So `20812345000019` — indicator `2` on the perfectly
 *    licensed prefix `0812345` — starts with `20` and a raw check would refuse
 *    a real GTIN. Drop the indicator first.
 *  - A UPC-A (GTIN-12) carries its restricted marker as number system `2`,
 *    which only lines up with `02` once zero-padded to 13.
 *
 * So: 14 → drop the indicator · 12 / 8 → zero-pad · 13 → as-is.
 */
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

/**
 * The gate for a GTIN a **person** entered, as opposed to one this app minted.
 *
 * The predicates it composes already existed for the interop projections; what
 * this adds is the entry-point ORDER and one message per refusal, so the field
 * and the route give the same answer. Two copies of "is this GTIN acceptable"
 * is how the placeholder GLN got printed in the first place.
 *
 * Order is deliberate — each rung answers a different question and a later one
 * cannot run on digits the earlier rejected:
 *
 *  1. **Length** — 8 / 12 / 13 / 14. Anything else is a typo or a different
 *     identifier entirely (a UPC-E, an ASIN, an MPN pasted into the wrong box).
 *  2. **Check digit** — catches the single transposed digit, which is the
 *     failure mode of typing 14 digits off a label. Not pedantry: bwip-js
 *     THROWS on a bad AI (01) checksum, so a bad GTIN here blanks every unit
 *     label it reaches instead of degrading.
 *  3. **Placeholder prefix** — the digits belong to GS1's own documentation
 *     examples. Someone copied a spec, and the number names another company.
 *  4. **Restricted circulation** — a `02…` / `20`–`29` internal number. This is
 *     the one refusal that is not an error on the operator's part: it is very
 *     likely THIS app's own minted value (`generateInternalGtin`) being typed
 *     back in. Refused because the field means *a key you licensed*, and the
 *     honest way to go back to the internal number is to clear the field —
 *     `getOrCreateInternalGtin` re-mints the same deterministic value.
 *
 * Clearing is NOT this function's job: an empty box means "no licensed GTIN",
 * which is a legal state, and the caller maps it to `null`. `'empty'` exists so
 * a caller that requires a value can say so.
 */
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

/**
 * Normalize a settings blob into an identity, dropping anything that is not
 * a usable GS1 value.
 *
 * A placeholder prefix is dropped rather than passed through — see the
 * module docblock. A GLN whose leading digits are a placeholder prefix is
 * dropped for the same reason, which is what keeps `DEFAULT_GLN` out.
 */
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

/**
 * GS1 mod-10 check digit for a numeric key, computed over all but the last
 * digit. Weights alternate 3/1 from the rightmost payload digit leftwards.
 *
 * Shared by GLN-13 and GTIN-8/12/13/14 — one algorithm, as the standard
 * defines it once.
 */
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
export function hasValidGs1CheckDigit(key: string): boolean {
  const digits = key.replace(/\D/g, '');
  if (digits.length < 2) return false;
  const body = digits.slice(0, -1);
  const check = digits.charCodeAt(digits.length - 1) - 48;
  return gs1CheckDigit(body) === check;
}

/**
 * True when a string is a GLN this tenant may actually assert: exactly 13
 * digits, a valid check digit, and not on a GS1 example prefix.
 *
 * THE shared predicate — the printed-label path
 * (`@/lib/barcode-routing` → `locationLabelPayload`) composes this too, so
 * "is this GLN real?" has one answer in the product. A second copy beside the
 * label printer is how the placeholder got printed in the first place.
 *
 * **The check digit is not pedantry, it is a render-time crash.** bwip-js
 * validates AI 414 when encoding a GS1 DataMatrix and THROWS
 * (`GS1badChecksum: AI 414: Bad checksum`) on a bad one — so a single typo in
 * the printer's GLN field would blank every label instead of degrading. This
 * predicate is what turns that into a quiet fallback to the bare code. Caught
 * by `location-label-encoding.guard.test.ts`.
 */
export function isLicensedGln(gln: string | null | undefined): boolean {
  const digits = (gln ?? '').replace(/\D/g, '');
  if (digits.length !== 13) return false;
  if (!hasValidGs1CheckDigit(digits)) return false;
  return !isPlaceholderGs1Prefix(digits);
}

/**
 * True when the tenant configured a real GLN we may put in `bizLocation`.
 *
 * Re-checks the placeholder list even though `resolveGs1Identity` already
 * dropped it. That is deliberate belt-and-braces, not redundancy: this
 * predicate and `glnIdentifier` are reachable with a RAW identity by any
 * caller that forgets to resolve first, and the failure mode of that mistake
 * is publishing GS1's documentation GLN to a partner. A check at the boundary
 * only protects callers who went through the boundary; a check at the mint
 * protects everyone.
 */
export function hasGln(
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

/**
 * Decide whether a tenant needs a licensed GS1 key, from what they told us.
 *
 * **This is a GTIN question, not a GLN one.** Amazon enforces a product
 * identifier when you create a listing for a BRAND-NEW item; selling refurb
 * against an existing ASIN needs no key you own, and eBay accepts "does not
 * apply" for used goods outright. A GLN answers to an EDI / EPCIS partner and
 * is deliberately NOT part of this verdict — gating it here would tell a
 * refurb reseller they need a warehouse identifier to sell a used laptop.
 *
 * **A Company Prefix is not the only legal answer.** GS1 sells individual
 * GTINs, and a brand owner may be exempt; both store nothing org-level because
 * the values land per-SKU on `sku_catalog.gtin`. Treating "no prefix on file"
 * as non-compliance would nag those tenants forever, which is why `unmet`
 * reads `gs1Status` rather than testing `hasCompanyPrefix` alone.
 *
 * Unanswered is never `unmet`: a tenant who has not been asked has not failed.
 */
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

/**
 * An identifier as it will appear in a projection.
 *
 * `scheme: 'gs1'` means a real, licensed key. `scheme: 'internal'` means a
 * Cycle Forge handle (`R-1234`, `H-88`, a carrier tracking number) rendered
 * in a URI namespace that is unmistakably ours. The distinction is the whole
 * point: a consumer can filter to `gs1` and get only keys it may resolve
 * globally, and the internal ones never masquerade as standards-backed.
 */
export interface InteropIdentifier {
  scheme: 'gs1' | 'internal';
  /** The GS1 key type when `scheme === 'gs1'`. */
  keyType?: Gs1KeyType;
  /** The full URI form. */
  uri: string;
  /** The bare value, for consumers that want the digits/handle alone. */
  value: string;
}

/**
 * URI namespace for Cycle Forge's internal handles.
 *
 * EPCIS explicitly allows non-GS1 EPC URIs, and a private URN is the
 * standard-sanctioned way to say "this identifies something, and it is mine".
 * A partner sees `urn:cycleforge:carton:1234` and knows not to try resolving
 * it against GS1.
 */
export const INTERNAL_URN_NAMESPACE = 'urn:cycleforge';

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

/**
 * Build the SGTIN for a serialized unit — "this individual unit of this
 * product", the key a reseller actually needs.
 *
 * Returns `null` when either half is missing. A serialized used unit is
 * exactly GTIN + serial, and `serial_units` already holds the serial half;
 * the GTIN half comes from `sku_catalog.gtin` and is frequently absent, which
 * is precisely when this must decline rather than improvise.
 *
 * Note this does NOT need `companyPrefix`: an SGTIN is not minted, it is
 * COMPOSED from a GTIN the tenant already holds (which carries its own
 * licensed prefix) plus a serial the tenant assigned. `companyPrefix` gates
 * the keys that must be constructed from scratch — SSCC, GRAI, GIAI.
 */
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
