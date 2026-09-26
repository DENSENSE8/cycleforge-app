'use client';

/**
 * Leaf paint for the `/search` browse toolbar — three cluster faces and the two control faces inside them.
 * ## Three clusters, three jobs, three faces (operator 2026-09-12)
 */

import type { ReactNode } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Badge } from '@/components/ui/badge';
import { Check } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { SEGMENTED_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { fieldLabel } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

/** Horizontal run of free-floating filter bubbles in one toolbar slot. */
export function RefineCluster({
  label,
  children,
}: {
  /** Names the cluster for assistive tech — the band paints no group headings. */
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={cn('row-tight min-w-0 flex-wrap')}>
      {children}
    </div>
  );
}

/** A segmented TRACK — one raised plate holding mutually exclusive faces. */
export function RefineTrack({
  label,
  labelText,
  children,
}: {
  label: string;
  labelText?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="row-tight min-w-0 flex-wrap items-center">
      {labelText ? (
        <span className={cn(fieldLabel, 'shrink-0 px-0.5')} aria-hidden>
          {labelText}
        </span>
      ) : null}
      <div
        className={cn(
          // The plate. Raised off the band's sunken tone — tone IS the
          // separator here, which is why there is no ring and no rule.
          SEGMENTED_CONTROL_CORNER,
          'inline-flex min-w-0 flex-wrap items-center gap-0.5 bg-surface-card p-0.5',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One face inside a {@link RefineTrack}. */
export function RefineTab({
  label,
  count,
  active,
  disabled,
  onClick,
}: {
  label: string;
  /** Live tally for this face. Omitted where a count is meaningless (sort). */
  count?: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      radius="pill"
      variant={active ? 'primary' : 'ghost'}
      aria-pressed={active}
      disabled={disabled}
      className="shrink-0"
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {count == null ? null : (
        <Badge
          variant={active ? 'secondary' : 'outline'}
          className={cn(cornerClass('pill'), 'tabular-nums')}
        >
          {count}
        </Badge>
      )}
    </Button>
  );
}

/** One FILTER bubble — additive, removable, and never the default. */
export function RefinePill({
  label,
  count,
  active,
  leading,
  disabled,
  onClick,
}: {
  label: string;
  /** Live tally for this pill. Omitted where a count is meaningless. */
  count?: number;
  active: boolean;
  leading?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      radius="pill"
      // `secondary` is the idle BUBBLE (card fill + soft ring) against the
      // band's sunken tone — `ghost` would flatten the row back into text and
      // would also erase the difference from a scope face.
      variant={active ? 'primary' : 'secondary'}
      aria-pressed={active}
      icon={leading}
      // Non-colour active cue (mono-display law): colour alone would not survive
      // a grayscale bench display.
      iconRight={active ? <Check /> : undefined}
      disabled={disabled}
      className="shrink-0"
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {count == null ? null : (
        <Badge
          variant={active ? 'secondary' : 'outline'}
          className={cn(cornerClass('pill'), 'tabular-nums')}
        >
          {count}
        </Badge>
      )}
    </Button>
  );
}
