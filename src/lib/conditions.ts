// Single source of truth for condition-grade display strings.

export const CONDITION_GRADES = [
  'BRAND_NEW',
  'LIKE_NEW',
  'REFURBISHED',
  'USED_A',
  'USED_B',
  'USED_C',
  'PARTS',
] as const;

export type ConditionGrade = (typeof CONDITION_GRADES)[number];

/** Marketplace / display strings → canonical grade codes. */

import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
const CONDITION_GRADE_ALIASES: Record<string, ConditionGrade> = {
  NEW: 'BRAND_NEW',
  'BRAND NEW': 'BRAND_NEW',
  BRANDNEW: 'BRAND_NEW',
  'L-NEW': 'LIKE_NEW',
  LNEW: 'LIKE_NEW',
  'L NEW': 'LIKE_NEW',
  'LIKE NEW': 'LIKE_NEW',
  'LIKE-NEW': 'LIKE_NEW',
  LIKENEW: 'LIKE_NEW',
  REF: 'REFURBISHED',
  REFURB: 'REFURBISHED',
  A: 'USED_A',
  'USED A': 'USED_A',
  'USED-A': 'USED_A',
  B: 'USED_B',
  'USED B': 'USED_B',
  'USED-B': 'USED_B',
  C: 'USED_C',
  'USED C': 'USED_C',
  'USED-C': 'USED_C',
  PART: 'PARTS',
  'FOR PARTS': 'PARTS',
  'FOR-PARTS': 'PARTS',
};

/**
 * Resolve a raw condition string (grade code OR marketplace alias) to its
 * canonical grade code. Unknown / empty values pass through trimmed+uppercased
 * so existing fallback paths behave exactly as before.
 */
export function resolveConditionGrade(code: string | null | undefined): string {
  const c = String(code || '').trim().toUpperCase();
  return CONDITION_GRADE_ALIASES[c] ?? c;
}

/**
 * Marketplace listing condition words (eBay / Amazon / ShopGoodwill ladders)
 * the grade aliases above do not name, keyed by the folded word (upper-case,
 * every non-alphanumeric run → one space).
 */
const LISTING_CONDITION_WORDS: Record<string, ConditionGrade> = {
  'NEW WITH TAGS': 'BRAND_NEW',
  'NEW WITH BOX': 'BRAND_NEW',
  'NEW SEALED': 'BRAND_NEW',
  'FACTORY SEALED': 'BRAND_NEW',
  'NEW OTHER': 'LIKE_NEW',
  'NEW OPEN BOX': 'LIKE_NEW',
  'OPEN BOX': 'LIKE_NEW',
  'USED LIKE NEW': 'LIKE_NEW',
  'USEDLIKENEW': 'LIKE_NEW',
  REFURBISHED: 'REFURBISHED',
  'CERTIFIED REFURBISHED': 'REFURBISHED',
  'SELLER REFURBISHED': 'REFURBISHED',
  'MANUFACTURER REFURBISHED': 'REFURBISHED',
  RENEWED: 'REFURBISHED',
  'VERY GOOD': 'USED_A',
  'USED VERY GOOD': 'USED_A',
  'USEDVERYGOOD': 'USED_A',
  EXCELLENT: 'USED_A',
  GOOD: 'USED_B',
  'USED GOOD': 'USED_B',
  'USEDGOOD': 'USED_B',
  ACCEPTABLE: 'USED_C',
  'USED ACCEPTABLE': 'USED_C',
  'USEDACCEPTABLE': 'USED_C',
  FAIR: 'USED_C',
  'FOR PARTS OR NOT WORKING': 'PARTS',
  'PARTS ONLY': 'PARTS',
  'AS IS': 'PARTS',
  SALVAGE: 'PARTS',
};

/**
 * The grade a listing's condition text names — a grade code, a grade alias
 * or a marketplace condition word; null when it names none (bare "Used" is
 * not a grade). The CSV import's reader for "condition bought at".
 */
export function conditionGradeFromListing(raw: string | null | undefined): ConditionGrade | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const direct = resolveConditionGrade(value);
  if ((CONDITION_GRADES as readonly string[]).includes(direct)) return direct as ConditionGrade;
  const folded = value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return CONDITION_GRADE_ALIASES[folded] ?? LISTING_CONDITION_WORDS[folded] ?? null;
}

export type ConditionLabelVariant =
  | 'pill'
  | 'table'
  | 'compact'
  | 'label'
  | 'full'
  | 'option';

export const CONDITION_LABELS: Record<ConditionLabelVariant, Record<string, string>> = {
  pill:    { BRAND_NEW: 'New',       LIKE_NEW: 'L-new',    REFURBISHED: 'Refurb',      USED_A: 'A',        USED_B: 'B',        USED_C: 'C',        PARTS: 'Parts' },
  table:   { BRAND_NEW: 'New',       LIKE_NEW: 'L-new',    REFURBISHED: 'Ref',         USED_A: 'A',        USED_B: 'B',        USED_C: 'C',        PARTS: 'Parts' },
  compact: { BRAND_NEW: 'New',       LIKE_NEW: 'Like New', REFURBISHED: 'Refurb',      USED_A: 'A',        USED_B: 'B',        USED_C: 'C',        PARTS: 'Parts' },
  label:   { BRAND_NEW: 'New',       LIKE_NEW: 'Like New', REFURBISHED: 'Refurbished', USED_A: 'Used - A', USED_B: 'Used - B', USED_C: 'Used - C', PARTS: 'Parts' },
  full:    { BRAND_NEW: 'Brand New', LIKE_NEW: 'Like New', REFURBISHED: 'Refurbished', USED_A: 'Used — A', USED_B: 'Used — B', USED_C: 'Used — C', PARTS: 'For Parts' },
  option:  { BRAND_NEW: 'Brand new', LIKE_NEW: 'Like new', REFURBISHED: 'Refurbished', USED_A: 'Used A',   USED_B: 'Used B',   USED_C: 'Used C',   PARTS: 'Parts' },
};

/** Human-readable label for a condition grade in the requested {@link ConditionLabelVariant}. */
export function conditionLabel(
  code: string | null | undefined,
  variant: ConditionLabelVariant = 'label',
): string {
  const c = resolveConditionGrade(String(code || 'BRAND_NEW'));
  // Outside the grade vocabulary (a marketplace word like "USED"): sentence case, never caps.
  return CONDITION_LABELS[variant][c] ?? sentenceCaseLabel(c);
}

/**
 * The triage cards' condition face, sentence case ("Like new", "Used - A",
 * "New") — one reader for every family. A marketplace word outside the grade
 * vocabulary ("USED") comes back sentence-cased too; lone grade letters stay.
 */
export function conditionSentenceLabel(code: string): string {
  return conditionLabel(code, 'label')
    .split(' ')
    .map((word, index) => (word.length === 1 ? word : index === 0 ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()))
    .join(' ');
}

/**
 * Dense list/table empty meta cell (qty | condition columns). Quieter than
 * "N/A", keeps fixed-column alignment — same glyph as {@link MetaFactSlot}.
 */
export const EMPTY_META_DASH = '--' as const;

/** Nudge empty `--` left of optical center inside the fixed condition track. */
export const EMPTY_META_DASH_ALIGN_CLASS = 'block w-full text-center -translate-x-1' as const;

/**
 * Marketplace / order-row condition display. Empty, legacy "N/A", and dash
 * placeholders collapse to {@link EMPTY_META_DASH}.
 */
export function orderRowConditionLabel(condition: string | null | undefined): string {
  const raw = String(condition || '').trim();
  if (!raw) return EMPTY_META_DASH;
  const upper = raw.toUpperCase();
  if (upper === 'N/A' || raw === EMPTY_META_DASH || raw === '—' || raw === '---') { // ds-allow-na: marketplace empty-vocab reader
    return EMPTY_META_DASH;
  }
  return raw;
}

/** True when {@link orderRowConditionLabel} would render the empty-meta dash. */
export function isEmptyMetaDash(value: string | null | undefined): boolean {
  return orderRowConditionLabel(value) === EMPTY_META_DASH;
}

/** Compact list-row grade label; empty / legacy N/A read as `--`. */
export function conditionGradeTableLabel(code: string | null | undefined): string {
  const c = String(code || '').trim().toUpperCase();
  if (!c || c === 'N/A') return EMPTY_META_DASH; // ds-allow-na: marketplace empty-vocab reader
  return conditionLabel(c, 'table');
}

/**
 * `{ value, label }[]` for all 7 grades in canonical order — the single source
 * for every condition-grade dropdown/picker. `full` is the default (the verbose
 * mixed-case form used in detail panels: Brand New · Used — A · For Parts).
 */
export function conditionOptions(
  variant: ConditionLabelVariant = 'full',
): Array<{ value: ConditionGrade; label: string }> {
  return CONDITION_GRADES.map((value) => ({ value, label: conditionLabel(value, variant) }));
}

/** One-line meaning for each grade — surfaced as a HoverTooltip on the condition pills so new staff (and new tenants) learn the grades in… */
const CONDITION_DESCRIPTIONS: Record<string, string> = {
  BRAND_NEW:   'Brand new — unused, in original packaging.',
  LIKE_NEW:    'Like new — open-box; no visible wear, fully functional.',
  REFURBISHED: 'Refurbished — restored and tested to working condition.',
  USED_A:      'Used · A — excellent; minimal wear, fully functional.',
  USED_B:      'Used · B — good; moderate wear, fully functional.',
  USED_C:      'Used · C — fair; heavy wear but functional.',
  PARTS:       'For parts — not working / salvage only.',
};

/** One-line meaning for a grade (for tooltips/help). Empty string for unknown codes. */
export function conditionDescription(code: string | null | undefined): string {
  return CONDITION_DESCRIPTIONS[resolveConditionGrade(code)] ?? '';
}

/** Inline-TEXT color for a condition — the substring-matched, lenient style used by the "condition + title" inline text (not chips): */
export function conditionTextColor(condition: string | null | undefined): string {
  const c = String(condition || '').toLowerCase().trim();
  if (c.includes('new')) return 'text-yellow-500';
  if (c.includes('part')) return 'text-orange-900';
  return 'text-black';
}
