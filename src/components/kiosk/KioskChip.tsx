'use client';

/** KioskChip — the TOUCH tier of the house chip family. */

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

/** Chip tone. `issue` is the amber "you picked a problem" wash the repair reasons use; `accent` is the neutral selected wash categories use. */
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

  /* ds-raw-button: */
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
