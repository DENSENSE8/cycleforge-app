'use client';

import type { ReactNode } from 'react';

/** Numeric / identifier typographic language for details-panel ledgers. */
export type LedgerValueVariant = 'text' | 'number' | 'id';

/** Hierarchy tier. */
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

// CF Type roles (plan §2.4 — ledger values use the `data` role, tabular). Weight
// capped at 600 (semibold); the `number`/`id` variants add tabular-nums below.
const TIER_CLASS: Record<LedgerValueTier, string> = {
  primary: 'text-role-body font-semibold',
  default: 'text-role-data font-semibold',
  meta: 'text-role-caption',
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
  /** Shown when `value` is empty. Default `—` (honest absence; never "N/A"). */
  fallback?: string;
  /** Truncate with ellipsis (needs a bounded parent width). */
  truncate?: boolean;
  /** Prevent wrapping — for identifiers/timestamps that must stay one line. */
  nowrap?: boolean;
  className?: string;
  title?: string;
}

/** Canonical value cell for details-panel ledgers — the single reusable way to render a field value so the numeric font, identifier font,… */
export function LedgerValue({
  value,
  children,
  variant = 'text',
  tier = 'default',
  tone = 'default',
  fallback = '—',
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
