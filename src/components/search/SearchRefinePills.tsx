'use client';

/**
 * Leaf paint for the `/search` browse toolbar — three cluster faces and the
 * two control faces inside them. Split out of {@link SearchRefineControls} so
 * that file stays the URL-contract layer (parse `?etype=`/`?hstat=`/`?chan=`/
 * `?colsort=`, write them back) and this one stays presentational.
 *
 * ## Three clusters, three jobs, three faces (operator 2026-09-12)
 *
 * The band used to wear ONE face: every control in it was the same bubble, so
 * scope, filters and sort were indistinguishable and the row read as a wall of
 * eleven-plus identical pills. They are not one job:
 *
 * - **Scope is NAVIGATION.** Picking `Orders` replaces the list; the options
 *   are mutually exclusive and exactly one is always live. That is a segmented
 *   TRACK — {@link RefineTrack} — a single raised plate holding ghost faces,
 *   so it reads as one control with a current position rather than as eleven
 *   independent toggles.
 * - **States and channels are FILTERS.** They are additive, individually
 *   removable, and none of them is the default. They stay free-floating
 *   BUBBLES ({@link RefinePill}) on the band itself — a chip you can peel off.
 * - **Sort is a CONTROL.** Also a track, but a LABELLED one: the word `Sort`
 *   in front of it is what separates "the ordering knob" from "where am I",
 *   which two unlabelled tracks at opposite ends of a band could not do alone.
 *
 * The separation is spacing, SURFACE TONE and grouping — never a rule. The
 * band sits on `bg-surface-sunken`, so a track plate is `bg-surface-card`
 * lifting off it and a bubble is a ringed card floating on it. There is no
 * `border-border-hairline` on this surface, deliberately (operator
 * 2026-09-12, who overruled the pill-row refusal for FIND browse).
 *
 * A pill/face is the house {@link Button} at `radius="pill"` — the sanctioned
 * `cornerClass('pill')` role. Never a `rounded-full` literal, never a raw
 * element, never a hue painted on with `className`.
 */

import type { ReactNode } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Badge } from '@/components/ui/badge';
import { Check } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { SEGMENTED_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { fieldLabel } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

/**
 * Horizontal run of free-floating filter bubbles in one toolbar slot.
 * `row-tight` is the gap intent.
 *
 * WRAPS, never scroll-clips. This carried a `scroll` prop that set
 * `overflow-x-auto scrollbar-hide`; in the centre slot — which the Toolbar
 * gives `flex-1 min-w-0` — that shrank to nothing behind an 11-pill scope
 * cluster and cut the status pills off mid-word, with `scrollbar-hide`
 * removing the only cue that more existed. A filter you cannot see is a filter
 * you do not know you have, so the row grows downward instead.
 */
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

/**
 * A segmented TRACK — one raised plate holding mutually exclusive faces.
 *
 * Used for the two clusters that are not filters: the entity scope (where am
 * I) and the display sort (how is it ordered). The plate is what says "these
 * belong to each other and exactly one of them is true"; a row of separate
 * bubbles says the opposite.
 *
 * `labelText` prints the cluster's job in front of the faces. The scope track
 * omits it (its faces name themselves and it is the band's first thing); the
 * sort track carries it, because an unlabelled pair reading `Relevance`
 * `Date` at the trailing edge could be read as two more filters.
 */
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

/**
 * One face inside a {@link RefineTrack}.
 *
 * `ghost` when idle: inside a plate the GROUPING already separates the faces,
 * so a per-face ring would draw eleven boxes inside one box. That absence is
 * the whole visual difference from a filter bubble.
 */
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

/**
 * One FILTER bubble — additive, removable, and never the default.
 *
 * Keeps the ring: a bubble floating on the band is the face of something you
 * added and can peel off, which is exactly what a status or channel refine is
 * and exactly what a scope is not.
 */
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
