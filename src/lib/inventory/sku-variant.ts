/** SKU variant — COLOR axis decoder (sku-reconciliation plan, Step B). */

/** A decoded color value, or the explicit UNCONFIRMED placeholder. */
interface SkuColorSuffixEntry {
  /** Stable color code (controlled vocabulary). `null` when unconfirmed. */
  code: string | null;
  /** Human-readable color label. `null` when unconfirmed. */
  label: string | null;
  /**
   * True ONLY for owner-confirmed entries. An unconfirmed suffix is in the map
   * for documentation/coverage but decodes to `null` so it can never tag a row.
   */
  confirmed: boolean;
}

/** Suffix (without the leading dash, upper-cased) → color entry. */
export const SKU_COLOR_SUFFIX_MAP: Record<string, SkuColorSuffixEntry> = {
  // ── Confirmed ──────────────────────────────────────────────────────────────
  B: { code: 'BLACK', label: 'Black', confirmed: true },
  W: { code: 'WHITE', label: 'White', confirmed: true },

  // ── UNCONFIRMED — needs owner confirmation of the color value ─────────────── Do NOT guess.
  N: { code: null, label: null, confirmed: false },
  // -S  → ? (e.g. Silver / Sand? — color value UNCONFIRMED)
  S: { code: null, label: null, confirmed: false },
  // -SW → ? (e.g. Snow White / Stone White? — color value UNCONFIRMED)
  SW: { code: null, label: null, confirmed: false },
};

/** The decoded color variant of a SKU string. */
interface DecodedSkuColor {
  /** The bare base SKU with the color suffix removed (`00046-B` → `00046`). */
  base: string;
  /** The matched color code (controlled vocabulary, e.g. `BLACK`). */
  colorCode: string;
  /** The human-readable color label (e.g. `Black`). */
  colorLabel: string;
}

/** A color suffix is a base (>= 1 char, not purely a part-index) + dash + one of the known LETTER-ONLY suffix tokens. */
const COLOR_SUFFIX_RE = /^(.+)-([A-Z]+)$/i;
/** A protected multi-part component index — never treat as a color. */
const PROTECTED_PART_INDEX = /^.+-P-[0-9]+$/i;

/** Decode the COLOR variant encoded in a SKU suffix. */
export function decodeSkuColorSuffix(sku: string | null | undefined): DecodedSkuColor | null {
  const s = String(sku ?? '').trim();
  if (!s) return null;

  // Never classify a protected -P-N part index as a color.
  if (PROTECTED_PART_INDEX.test(s)) return null;

  const m = COLOR_SUFFIX_RE.exec(s);
  if (!m) return null;

  const base = m[1].trim();
  const token = m[2].toUpperCase();
  if (!base) return null;

  const entry = SKU_COLOR_SUFFIX_MAP[token];
  // Unknown token OR an explicit UNCONFIRMED entry → decode to null (never tag).
  if (!entry || !entry.confirmed || !entry.code || !entry.label) return null;

  return { base, colorCode: entry.code, colorLabel: entry.label };
}

/** A SKU's optional color variant, exposed alongside a resolved catalog row. */
export interface SkuColorVariant {
  colorCode: string;
  colorLabel: string;
}

/**
 * Lightweight accessor for the color variant of a SKU string — `null` when the
 * SKU encodes no confirmed color. Thin wrapper over {@link decodeSkuColorSuffix}
 * for read paths that only want the color (not the base).
 */
export function skuColorVariant(sku: string | null | undefined): SkuColorVariant | null {
  const decoded = decodeSkuColorSuffix(sku);
  if (!decoded) return null;
  return { colorCode: decoded.colorCode, colorLabel: decoded.colorLabel };
}
