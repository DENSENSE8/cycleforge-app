'use client';

/**
 * KioskChip — the TOUCH tier of the house chip family.
 *
 * The desk tier is `badge` (`@/components/ui/badge`): a square
 * (`rounded-none`), 18px-tall, bordered chip built for dense grid rows. It is
 * the right chip for a desk and the wrong one for a counter tablet, where a
 * chip is something a customer's thumb lands on and the whole surface reads
 * rounded. Rather than fork `badge` with a radius override at every call site —
 * or keep hand-composing `KIOSK_PILL` + a tone token, which is what
 * `ReasonSelector` was doing — the kiosk tier is ONE component.
 *
 * Two faces, one vocabulary:
 *   - `row`  — full-width selectable pill (reason pills, option stacks). Touch
 *              height, left-aligned, `aria-pressed` when it is a choice.
 *   - `meta` — inline fact chip on a card (line type, qty, state).
 *
 * `onClick` decides the element: a chip that does something is a `<button>`, a
 * chip that states a fact is a `<span>`. That is why there is no `as` prop.
 *
 * Callers: `ReasonSelector` (pills), `KioskCartLineCard`. Affected API: none.
 * Schemas: none.
 * User: "a mobile-like chip display component with a rounded corner radius and
 * kind of pills and buttons … throughout the kiosk v2" (Phase 2).
 */

import type { ReactNode } from 'react';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  KIOSK_META,
  KIOSK_PILL,
  KIOSK_PILL_ACTIVE,
  KIOSK_PILL_ACTIVE_ISSUE,
  KIOSK_PILL_IDLE,
} from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

/**
 * Chip tone. `issue` is the amber "you picked a problem" wash the repair
 * reasons use; `accent` is the neutral selected wash categories use.
 *
 * `thumb` is the SELECTED SEGMENT OF A TRACK, and it exists because `accent`
 * cannot do that job: `surface-accent` on the `surface-sunken` trough of a
 * segmented control computes rgb(240,244,251) on rgb(241,245,249) — one point
 * of luminance, so the selected side was invisible and only its Check said
 * which way the control was set (measured on the kiosk ticket slider,
 * 2026-09-15). A thumb is a RAISED face: card-white with a hairline, the
 * standard segmented-control idiom. Grown here rather than overridden with a
 * `bg-` class at the call site — the same rule `AGENTS.md` states for Button
 * fills, and the reason this component exists.
 */
export type KioskChipTone =
  | 'idle'
  | 'accent'
  | 'thumb'
  | 'issue'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

/** Row face tones — the selectable pill stack. */
const ROW_TONE: Record<KioskChipTone, string> = {
  idle: KIOSK_PILL_IDLE,
  accent: KIOSK_PILL_ACTIVE,
  thumb: 'bg-surface-card text-text-default ring-1 ring-border-soft',
  issue: KIOSK_PILL_ACTIVE_ISSUE,
  info: 'bg-surface-accent text-text-info',
  success: 'bg-surface-success text-text-success',
  warning: 'bg-surface-warning text-text-warning',
  danger: 'bg-surface-danger text-text-danger',
};

/** Meta face tones — quiet washes, no border ring (the card carries the edge). */
const META_TONE: Record<KioskChipTone, string> = {
  idle: 'bg-surface-sunken text-text-soft',
  accent: 'bg-surface-accent text-text-default',
  // A fact chip is not in a track; it gets the card face without the ring so
  // the tone stays usable rather than becoming a second outlined pill.
  thumb: 'bg-surface-card text-text-default',
  issue: 'bg-amber-50 text-amber-900',
  info: 'bg-surface-accent text-text-info',
  success: 'bg-surface-success text-text-success',
  warning: 'bg-surface-warning text-text-warning',
  danger: 'bg-surface-danger text-text-danger',
};

/** Inline fact chip — tablet-readable, never desk-micro. */
const META_FACE = cn(
  'inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1',
  KIOSK_META,
  'text-inherit',
  cornerClass('pill'),
);

export function KioskChip({
  face = 'meta',
  tone = 'idle',
  selected,
  onClick,
  icon,
  trailing,
  ariaLabel,
  title,
  disabled,
  className,
  testId,
  children,
}: {
  face?: 'row' | 'meta';
  tone?: KioskChipTone;
  /** Selection state for a choice chip — paints `aria-pressed`. */
  selected?: boolean;
  onClick?: () => void;
  /** Leading glyph. Glyph + text together — never colour alone. */
  icon?: ReactNode;
  /** Trailing slot (e.g. the row face's Check overlay). */
  trailing?: ReactNode;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const row = face === 'row';
  const classes = cn(
    row ? KIOSK_PILL : META_FACE,
    row ? ROW_TONE[tone] : META_TONE[tone],
    onClick && focusRing('control', 'neutral'),
    className,
  );
  const body = (
    <>
      {icon}
      <span className={cn(row && 'min-w-0 flex-1 truncate font-semibold', 'text-inherit')}>
        {children}
      </span>
      {trailing}
    </>
  );

  if (!onClick) {
    return (
      <span className={classes} aria-label={ariaLabel} title={title} data-testid={testId}>
        {body}
      </span>
    );
  }

  /*
   * ds-raw-button: a CHIP is not an ops CTA.
   *
   * `Button` carries its own size ladder (h-8/9/10), variant fills and radius
   * prop — mounting it here would mean fighting all three with class
   * overrides to get a touch-tall pill wearing a tone wash. The desk tier of
   * this family (`badge`) is a raw `<span>`/Slot for the same reason, and
   * `KIOSK_PILL` already carries the sanctioned escape in its own class
   * string. Focus, disabled and pressed states are explicit below.
   */
  return (
    <button
      type="button"
      className={cn('ds-raw-button', classes)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
    >
      {body}
    </button>
  );
}
