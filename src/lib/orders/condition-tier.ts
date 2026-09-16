/**
 * Sold-condition tier ↔ unit grade — the refurb allocation gate.
 *
 * ## Why this exists
 *
 * eBay Refurbished and Amazon Renewed are CONTRACTUAL tiers, not adjectives.
 * Shipping a lesser unit than the listing promised is an "Item Not as
 * Described" / order defect, and both programs gate account survival on it
 * (eBay INAD < 4%, Amazon ODR < 0.8%). So the moment we reserve a specific
 * serialized unit for an order line, the unit's grade MUST satisfy what the
 * buyer was sold. That check belongs here, once, not re-derived per surface.
 *
 * ## Why a normalizer and not a lookup
 *
 * `orders.condition` is free text written by three importers over two years.
 * Live distribution (2026-09-14, 4581 rows):
 *
 *     USED 2869 · NEW 1039 · '' 437 · null 81 · New 67 · USED_B 65
 *     PARTS 52 · 'Very Good' 5 · USED_A 2 · BRAND_NEW 2 · good 2 · 'very good' 1
 *
 * Case variants, internal enum names, and marketplace tier names all coexist.
 *
 * ## The load-bearing decision: bare "USED" promises NOTHING
 *
 * 2869 of 4581 orders say exactly `USED`. That is a category, not a tier — the
 * listing made no cosmetic promise. Mapping it to a concrete grade (say
 * USED_A) would make a perfectly shippable USED_B unit fail the gate and
 * strand the majority of the book. So an unrecognised or generic condition
 * resolves to `null` = "no tier promised", and the gate then enforces only the
 * floor that every marketplace shares: a functional unit, never a PARTS unit,
 * unless PARTS is what was sold.
 *
 * Pure module: no I/O, no DB. Callers: allocation planner, pick list, desk
 * badges.
 */

/** Unit grades, worst → best. Mirrors `condition_grade_enum` in the schema. */
export const GRADE_ORDER = [
  'PARTS',
  'USED_C',
  'USED_B',
  'USED_A',
  'REFURBISHED',
  'LIKE_NEW',
  'BRAND_NEW',
] as const;

export type ConditionGrade = (typeof GRADE_ORDER)[number];

/**
 * Higher rank = better unit. Compare with `>=`; never compare grade strings.
 * `Readonly` because the ladder is a contract, not a knob — a caller mutating
 * it would silently redefine what every marketplace tier accepts.
 */
export const GRADE_RANK: Readonly<Record<ConditionGrade, number>> = {
  PARTS: 0,
  USED_C: 1,
  USED_B: 2,
  USED_A: 3,
  REFURBISHED: 4,
  LIKE_NEW: 5,
  BRAND_NEW: 6,
};

/**
 * Raw sold-condition string → the MINIMUM grade that satisfies it.
 *
 * The same column receives internal enum values, eBay tier names
 * (`Certified / Excellent / Very Good / Good - Refurbished`) and Amazon's
 * (`Renewed Premium / Renewed`).
 *
 * ORDER IS LOAD-BEARING TWICE OVER:
 *   1. On eBay the tier lives in the PREFIX and "- Refurbished" is just the
 *      programme suffix, so every tier adjective must be tested before the
 *      generic `refurb|renewed` pattern. Otherwise "Good - Refurbished" — the
 *      programme's LOWEST tier — resolves to REFURBISHED and the allocator
 *      demands a better unit than was sold.
 *   2. "very good" must precede bare "good", and "like new" / "brand new"
 *      must precede bare "new", or the looser word swallows the stricter one.
 */
const TIER_PATTERNS: ReadonlyArray<readonly [RegExp, ConditionGrade]> = [
  // Parts first: salvage intent overrides any other adjective in the string.
  [/\b(parts|not working|salvage|scrap)\b/, 'PARTS'],
  [/\b(brand[\s_-]?new|bnib|nib)\b/, 'BRAND_NEW'],
  [/\b(like[\s_-]?new|open[\s_-]?box|certified|renewed[\s_-]?premium|excellent|mint)\b/, 'LIKE_NEW'],
  [/\bvery[\s_-]?good\b/, 'REFURBISHED'],
  [/\bused[\s_-]?a\b/, 'USED_A'],
  [/\b(good|used[\s_-]?b)\b/, 'USED_B'],
  [/\b(acceptable|fair|used[\s_-]?c)\b/, 'USED_C'],
  // Generic programme words, only once no tier adjective matched.
  [/\b(refurb\w*|renewed)\b/, 'REFURBISHED'],
  // Bare `new` last: "like new" / "brand new" already matched above.
  [/\bnew\b/, 'BRAND_NEW'],
];

/**
 * The tier a listing promised, or null when it promised no tier.
 *
 * null is the honest answer for `USED`, blank, and anything unrecognised — see
 * the module note. Exact internal enum values are honoured first so a
 * round-tripped `USED_A` keeps its precise meaning instead of being widened by
 * the `used[\s_-]?a` → REFURBISHED pattern.
 */
export function normalizeSoldTier(raw: string | null | undefined): ConditionGrade | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  if ((GRADE_ORDER as readonly string[]).includes(upper)) return upper as ConditionGrade;

  const lower = text.toLowerCase();
  // A bare category, not a tier. Listed explicitly so the intent is auditable
  // rather than falling through as "unrecognised".
  if (/^(used|pre[\s_-]?owned|second[\s_-]?hand)$/.test(lower)) return null;

  for (const [pattern, grade] of TIER_PATTERNS) {
    if (pattern.test(lower)) return grade;
  }
  return null;
}

export type TierVerdictCode = 'OK' | 'UNGRADED' | 'BELOW_TIER' | 'PARTS_NOT_SOLD_AS_PARTS';

export interface TierVerdict {
  ok: boolean;
  code: TierVerdictCode;
  /** Operator-facing sentence. Disabled CTAs must name what is missing (R9). */
  message: string;
}

const VERDICT_OK: TierVerdict = { ok: true, code: 'OK', message: '' };

/**
 * May this unit satisfy this order line?
 *
 * - Ungraded unit → refuse. An unknown grade cannot be proven to meet a tier,
 *   and refurb programs can demand the grading evidence for 180 days.
 * - PARTS unit → refuse unless PARTS was what was sold. This is the floor that
 *   applies even when no tier was promised.
 * - Otherwise → the unit must rank at or above the promised tier.
 */
export function gradeMeetsSoldTier(
  unitGrade: ConditionGrade | null | undefined,
  soldTier: ConditionGrade | null,
): TierVerdict {
  if (!unitGrade) {
    return {
      ok: false,
      code: 'UNGRADED',
      message: 'Unit has no condition grade — grade it before allocating.',
    };
  }

  if (unitGrade === 'PARTS' && soldTier !== 'PARTS') {
    return {
      ok: false,
      code: 'PARTS_NOT_SOLD_AS_PARTS',
      message: 'Unit is graded PARTS and this order was not sold as parts.',
    };
  }

  if (!soldTier) return VERDICT_OK;

  if (GRADE_RANK[unitGrade] < GRADE_RANK[soldTier]) {
    return {
      ok: false,
      code: 'BELOW_TIER',
      message: `Unit is ${unitGrade} but the listing promised ${soldTier} or better.`,
    };
  }

  return VERDICT_OK;
}

/**
 * Grades that satisfy a tier, best-first — the ORDER BY a picker wants.
 *
 * Best-first, not worst-first: a refurb operation protects its INAD rate by
 * over-delivering, and the highest grade on the shelf is the one least likely
 * to be disputed. Callers that want to preserve premium stock can reverse it.
 */
export function gradesSatisfying(soldTier: ConditionGrade | null): ConditionGrade[] {
  const floor = soldTier ? GRADE_RANK[soldTier] : GRADE_RANK.USED_C;
  return GRADE_ORDER.filter((g) => GRADE_RANK[g] >= floor).reverse();
}
