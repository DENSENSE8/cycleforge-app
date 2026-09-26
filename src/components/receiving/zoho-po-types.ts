import {
  CONDITION_GRADES,
  conditionLabel as conditionGradeLabel,
  conditionOptions,
} from '@/lib/conditions';

// All 7 grades from the shared source of truth (was a 5-grade subset).
export const CONDITION_OPTIONS = conditionOptions('full');

// Friendly labels for every condition grade, used anywhere a raw enum like `BRAND_NEW` would otherwise leak to a human — ticket bodies,…
export function conditionLabel(code: string | null | undefined): string {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return '';
  if ((CONDITION_GRADES as readonly string[]).includes(c)) {
    return conditionGradeLabel(c, 'full');
  }
  // Unknown grade: title-case the raw value so it still reads cleanly.
  return c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

