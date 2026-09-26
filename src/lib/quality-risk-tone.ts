// Single source of truth for unit quality risk-level tones.

type QualityRiskLevel = 'low' | 'medium' | 'high';

const TONES: Record<QualityRiskLevel, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
};

/** Ring chip classes for a quality risk level; falls back to `medium`. */
export function qualityRiskToneClass(level: string): string {
  return TONES[level as QualityRiskLevel] ?? TONES.medium;
}
