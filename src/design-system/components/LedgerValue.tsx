'use client';

import type { ReactNode } from 'react';

/**
 * Numeric / identifier typographic language for details-panel ledgers.
 *
 * - `text`   — proportional figures (names, titles, free text).
 * - `number` — `tabular-nums` so a stacked column of figures aligns digit-for-digit
 *              (counts, durations, days-late, prices).
 * - `id`     — `font-mono tabular-nums` for scan-and-compare identifiers
 *              (order id, tracking, serial, item number) where transposition
 *              errors must be visible and equal-width.
 */
export type LedgerValueVariant = 'text' | 'number' | 'id';

/**
 * Hierarchy tier. Ledgers were previously all one weight (`text-sm font-bold`),
 * so nothing read as primary. `default` preserves that exact look for a 1:1
 * migration; `primary` is the record's identity entry-point; `meta` is
 * secondary provenance that should recede.
 */
export type LedgerValueTier = 'primary' | 'default' | 'meta';

/** Status/emphasis color — semantic tokens only, never a raw Tailwind shade. */
export type LedgerValueTone =
  | 'default'
  | 'muted'
  | 'soft'
  | 'faint'
  | 'danger'
  | 'warning'
  | 'success'
  | 'accent';

const TIER_CLASS: Record<LedgerValueTier, string> = {
  primary: 'text-base font-semibold',
  default: 'text-sm font-bold',
  meta: 'text-caption font-medium',
};

const VARIANT_CLASS: Record<LedgerValueVariant, string> = {
  text: '',
  number: 'tabular-nums',
  id: 'font-mono tabular-nums',
};

const TONE_CLASS: Record<LedgerValueTone, string> = {
  default: 'text-text-default',
  muted: 'text-text-muted',
  soft: 'text-text-soft',
  faint: 'text-text-faint',
  danger: 'text-text-danger',
  warning: 'text-text-warning',
  success: 'text-text-success',
  accent: 'text-text-accent',
};

interface LedgerValueProps {
  /**
   * The value to render. Empty / null / undefined falls back to `fallback`
   * (rendered in the `faint` tone regardless of `tone`). Pass `children`
   * instead when composing a non-text node (a chip, a link).
   */
  value?: string | number | null;
  /** Non-text content (chip/link). Takes precedence over `value`; no fallback logic. */
  children?: ReactNode;
  variant?: LedgerValueVariant;
  tier?: LedgerValueTier;
  tone?: LedgerValueTone;
  /** Shown when `value` is empty. Default "N/A". */
  fallback?: string;
  /** Truncate with ellipsis (needs a bounded parent width). */
  truncate?: boolean;
  /** Prevent wrapping — for identifiers/timestamps that must stay one line. */
  nowrap?: boolean;
  className?: string;
  title?: string;
}

/**
 * Canonical value cell for details-panel ledgers — the single reusable way to
 * render a field value so the numeric font, identifier font, hierarchy weight,
 * and status color come from one place instead of being hand-rolled per row.
 *
 * Sibling of {@link ./DateTimeValue.tsx DateTimeValue} (the timestamp-specific
 * cell); use `DateTimeValue` for `MM/DD/YYYY h:mm:ss` timestamps and
 * `LedgerValue` for everything else.
 *
 * @example
 * <LedgerValue value={techName} truncate />                       // name (default)
 * <LedgerValue value={order.id} variant="id" nowrap />            // scan-compare id
 * <LedgerValue value={daysLate} variant="number" tone="danger" /> // aligned figure
 * <LedgerValue value={null} />                                    // → faint "N/A"
 */
export function LedgerValue({
  value,
  children,
  variant = 'text',
  tier = 'default',
  tone = 'default',
  fallback = 'N/A',
  truncate = false,
  nowrap = false,
  className = '',
  title,
}: LedgerValueProps) {
  const isEmpty =
    children == null &&
    (value == null || (typeof value === 'string' && value.trim() === ''));

  const resolvedTone = isEmpty ? 'faint' : tone;

  const cls = [
    TIER_CLASS[tier],
    VARIANT_CLASS[variant],
    TONE_CLASS[resolvedTone],
    truncate ? 'block max-w-full truncate' : '',
    nowrap ? 'whitespace-nowrap' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <span className={cls} title={title}>
      {children ?? (isEmpty ? fallback : value)}
    </span>
  );
}
