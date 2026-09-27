'use client';

import type { ComponentProps } from 'react';
import { useReducedMotion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { AnimateNumber } from '@/design-system/motion/plus';

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
   * - `default` — KPI / goal surfaces (quantityBump)
   * - `fast` — station scan feedback (snappier digit rolls)
   */
  speed?: 'default' | 'fast';
};

const FAST_TRANSITION = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 38,
  mass: 0.35,
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
  speed = 'default',
}: AnimatedStatProps) {
  const reduce = useReducedMotion();
  const safe = Number.isFinite(value) ? value : null;

  if (safe === null) {
    return <span className={cn('tabular-nums', className)}>—</span>;
  }

  if (reduce) {
    const formatted = new Intl.NumberFormat(locales, format).format(safe);
    return (
      <span className={cn('inline-flex tabular-nums', className)}>
        {prefix}
        {formatted}
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
      transition={speed === 'fast' ? FAST_TRANSITION : motionTransition.quantityBump}
    >
      {safe}
    </AnimateNumber>
  );
}
