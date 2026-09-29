/**
 * The FBA unit-label condition vocabulary. `fba_fnskus.condition` keeps the
 * legacy house-grade prefix (`B+ Used - Very Good`), while operator UI and the
 * physical FNSKU label show Amazon's condition words (`Used - Very Good`).
 *
 * Each maps to a house condition grade, so it wears that grade's colour
 * everywhere (`CONDITION_GRADE_TONE`).
 */
import type { ConditionGrade } from '@/lib/conditions';

export interface FbaCondition {
  /** Stored in `fba_fnskus.condition` and printed on the label. */
  value: string;
  /** What an operator reads. */
  label: string;
  /** The house grade whose colour it wears. */
  grade: ConditionGrade;
}

export const FBA_CONDITIONS: readonly FbaCondition[] = [
  { value: 'A+ New', label: 'New', grade: 'BRAND_NEW' },
  { value: 'A Used - Like New', label: 'Used - Like New', grade: 'LIKE_NEW' },
  { value: 'B+ Used - Very Good', label: 'Used - Very Good', grade: 'USED_A' },
  { value: 'B Used - Good', label: 'Used - Good', grade: 'USED_B' },
  { value: 'C Used - Acceptable', label: 'Used - Acceptable', grade: 'USED_C' },
];

const GRADE_PREFIX = /^[A-C]\+?\s+/i;
const words = (raw: string) => raw.trim().replace(GRADE_PREFIX, '').toLowerCase();

/** The vocabulary entry a stored condition stands for (prefixed or bare); null when blank or unknown. */
export function fbaCondition(raw: string | null | undefined): FbaCondition | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const key = words(text);
  return FBA_CONDITIONS.find((entry) => entry.value.toLowerCase() === text.toLowerCase() || words(entry.label) === key) ?? null;
}

/** Amazon-facing condition words for previews and physical FNSKU labels. */
export function fbaConditionLabel(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  return fbaCondition(text)?.label ?? text.replace(GRADE_PREFIX, '');
}

/** True when `value` is one of the stored values (what a write may set). */
export function isFbaConditionValue(value: unknown): value is string {
  return typeof value === 'string' && FBA_CONDITIONS.some((entry) => entry.value === value);
}
