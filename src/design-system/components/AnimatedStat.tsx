'use client';

import type { ComponentProps } from 'react';
import { useReducedMotion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { AnimateNumber } from '@/design-system/motion/plus';
import {
  resolveAnimatedStatValue,
  type AnimatedStatProfile,
} from './animated-stat-model';

type AnimateNumberFormat = NonNullable<ComponentProps<typeof AnimateNumber>['format']>;

type AnimatedStatProps = {
  /** Numeric value to display. Non-finite values render as `—`. */
  value: number;
  className?: string;
  /** Locale(s) for `Intl.NumberFormat`. Defaults to runtime locale. */
  locales?: Intl.LocalesArgument;
  /** Options passed to `Intl.NumberFormat` (scientific/engineering notation unsupported). */
  format?: AnimateNumberFormat;
  /** Static text before the number (e.g. `~`). */
  prefix?: string;
  /** Static text after the number (e.g. `/mo`). */
  suffix?: string;
  /**
   * Spring profile:
   * - `kpi` — KPI / goal surfaces (quantityBump)
   * - `scanQuantity` — station scan feedback (snappier digit rolls)
   */
  profile?: AnimatedStatProfile;
  /** @deprecated Use the semantic `profile` prop. */
  speed?: 'default' | 'fast';
};

/**
 * Motion+ digit counter for live stats, goals, and scan qty.
 * Collapses to a static `tabular-nums` span under `prefers-reduced-motion`.
 */
export function AnimatedStat({
  value,
  className,
  locales,
  format,
  prefix,
  suffix,
  profile,
  speed,
}: AnimatedStatProps) {
  const reduce = useReducedMotion();
  const resolved = resolveAnimatedStatValue(value, locales, format);
  const resolvedProfile = profile ?? (speed === 'fast' ? 'scanQuantity' : 'kpi');

  if (resolved.kind === 'missing') {
    return <span className={cn('tabular-nums', className)}>—</span>;
  }

  if (reduce) {
    return (
      <span className={cn('inline-flex tabular-nums', className)}>
        {prefix}
        {resolved.formatted}
        {suffix}
      </span>
    );
  }

  return (
    <AnimateNumber
      className={cn('inline-flex tabular-nums', className)}
      locales={locales}
      format={format}
      prefix={prefix}
      suffix={suffix}
      transition={
        resolvedProfile === 'scanQuantity'
          ? motionTransition.quantityBumpFast
          : motionTransition.quantityBump
      }
    >
      {resolved.value}
    </AnimateNumber>
  );
}
