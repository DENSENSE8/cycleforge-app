export type AnimatedStatProfile = 'kpi' | 'scanQuantity';

export type AnimatedStatValue =
  | { kind: 'number'; value: number; formatted: string }
  | { kind: 'missing'; formatted: '—' };

/** Product value in, display truth out. Animation never decides validity. */
export function resolveAnimatedStatValue(
  value: number,
  locales?: Intl.LocalesArgument,
  format?: Intl.NumberFormatOptions,
): AnimatedStatValue {
  if (!Number.isFinite(value)) return { kind: 'missing', formatted: '—' };
  return {
    kind: 'number',
    value,
    formatted: new Intl.NumberFormat(locales, format).format(value),
  };
}
