/** Sold-condition tier ↔ unit grade — the refurb allocation gate. */

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

/** Raw sold-condition string → the MINIMUM grade that satisfies it. */
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

/** The tier a listing promised, or null when it promised no tier. */
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

/** May this unit satisfy this order line? */
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

/** Grades that satisfy a tier, best-first — the ORDER BY a picker wants. */
export function gradesSatisfying(soldTier: ConditionGrade | null): ConditionGrade[] {
  const floor = soldTier ? GRADE_RANK[soldTier] : GRADE_RANK.USED_C;
  return GRADE_ORDER.filter((g) => GRADE_RANK[g] >= floor).reverse();
}
