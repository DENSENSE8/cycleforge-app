// Single source of truth for condition-grade display strings.
//
// The same 7 grades (BRAND_NEW … PARTS) are shown in several different shapes
// across the app. Historically each surface hand-rolled its own grade→label
// map, so a one-word wording change (e.g. "Refurb" → "Refurbished") meant
// editing many files and the renderings drifted apart. Add or change a grade's
// wording HERE — never re-inline a grade→label map in a component.
//
// Each VARIANT is one shape of the same data:
//   pill    — picker pills (the UI CSS-uppercases them): NEW · L-New · REFURB · A · B · C · PARTS
//   table   — compact list/table chips:                  NEW · L-NEW · REF · A · B · C · PARTS
//   compact — short rail / label copy:                   New · Like New · Refurb · A · B · C · Parts
//   label   — printed + previewed receiving label:       New · Like New · Refurbished · Used - A · … · Parts
//   full    — Zendesk / exports / pickup work orders:    Brand New · Like New · Refurbished · Used — A · … · For Parts
//   option  — generic dropdown (raw, CSS may up-case):   BRAND NEW · LIKE NEW · REFURBISHED · USED A · … · PARTS

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

/**
 * Marketplace / display strings → canonical grade codes. Order rows ingested
 * from marketplaces carry raw strings ("NEW", "L-NEW", "REFURB", "A"…) rather
 * than grade codes; resolving them HERE is what lets the tone + label SoTs
 * color-code those rows exactly like grade-coded inventory. Bare "USED" stays
 * unmapped on purpose — it names no specific grade (A/B/C), so it keeps the
 * neutral fallback tone instead of claiming one.
 */
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

export type ConditionLabelVariant =
  | 'pill'
  | 'table'
  | 'compact'
  | 'label'
  | 'full'
  | 'option';

export const CONDITION_LABELS: Record<ConditionLabelVariant, Record<string, string>> = {
  pill:    { BRAND_NEW: 'NEW',       LIKE_NEW: 'L-New',    REFURBISHED: 'REFURB',      USED_A: 'A',        USED_B: 'B',        USED_C: 'C',        PARTS: 'PARTS' },
  table:   { BRAND_NEW: 'NEW',       LIKE_NEW: 'L-NEW',    REFURBISHED: 'REF',         USED_A: 'A',        USED_B: 'B',        USED_C: 'C',        PARTS: 'PARTS' },
  compact: { BRAND_NEW: 'New',       LIKE_NEW: 'Like New', REFURBISHED: 'Refurb',      USED_A: 'A',        USED_B: 'B',        USED_C: 'C',        PARTS: 'Parts' },
  label:   { BRAND_NEW: 'New',       LIKE_NEW: 'Like New', REFURBISHED: 'Refurbished', USED_A: 'Used - A', USED_B: 'Used - B', USED_C: 'Used - C', PARTS: 'Parts' },
  full:    { BRAND_NEW: 'Brand New', LIKE_NEW: 'Like New', REFURBISHED: 'Refurbished', USED_A: 'Used — A', USED_B: 'Used — B', USED_C: 'Used — C', PARTS: 'For Parts' },
  option:  { BRAND_NEW: 'BRAND NEW', LIKE_NEW: 'LIKE NEW', REFURBISHED: 'REFURBISHED', USED_A: 'USED A',   USED_B: 'USED B',   USED_C: 'USED C',   PARTS: 'PARTS' },
};

/**
 * Human-readable label for a condition grade in the requested {@link
 * ConditionLabelVariant}. Unknown codes fall back to an underscore-stripped
 * upper-case form (matches the legacy hand-rolled maps); empty/nullish codes
 * default to BRAND_NEW (the receiving-line default), except callers that want
 * an empty meta placeholder should guard for empty before calling — prefer
 * {@link orderRowConditionLabel} / {@link conditionGradeTableLabel}.
 */
export function conditionLabel(
  code: string | null | undefined,
  variant: ConditionLabelVariant = 'label',
): string {
  const c = resolveConditionGrade(String(code || 'BRAND_NEW'));
  return CONDITION_LABELS[variant][c] ?? c.replace(/_/g, ' ');
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
  if (upper === 'N/A' || raw === EMPTY_META_DASH || raw === '—' || raw === '---') {
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
  if (!c || c === 'N/A') return EMPTY_META_DASH;
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

/**
 * One-line meaning for each grade — surfaced as a HoverTooltip on the condition
 * pills so new staff (and new tenants) learn the grades in place instead of
 * guessing what A vs B vs C means. Same single-source-of-truth discipline as the
 * labels: add/adjust wording HERE, never inline a description in a component.
 */
export const CONDITION_DESCRIPTIONS: Record<string, string> = {
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

/**
 * Inline-TEXT color for a condition — the substring-matched, lenient style used
 * by the "condition + title" inline text (not chips): new → yellow-500,
 * for-parts → amber-800, else (used/unknown) → black. Single source of truth;
 * `ConditionText.getConditionColor` delegates here. (Chip/badge condition tones
 * are a separate, per-surface concern — see receiving-constants
 * `conditionBadgeTone`.)
 */
export function conditionTextColor(condition: string | null | undefined): string {
  const c = String(condition || '').toLowerCase().trim();
  if (c.includes('new')) return 'text-yellow-500';
  if (c.includes('part')) return 'text-amber-800';
  return 'text-black';
}
