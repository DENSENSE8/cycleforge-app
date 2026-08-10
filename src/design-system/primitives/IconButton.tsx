'use client';

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { focusRing } from '../tokens/focus-ring';

type IconButtonTone = 'neutral' | 'accent';

/**
 * Box-size contract (control-size axis). Opt-in: without `size` the button
 * stays the legacy bare glyph-button (the glyph is the hit target). With
 * `size` the button owns a fixed square hit-box + centering; the glyph keeps
 * its own canonical size — pair them as: xs/sm → `h-3.5 w-3.5` glyph ·
 * md/lg → `h-4 w-4` · touch → `h-5 w-5`. Values rhyme with `Button`
 * (sm h-8 / md h-9) and `touch` is the 44px iOS-HIG tap floor (the old
 * `tokens/touch.ts` job, folded in here). The scale is density-aware for
 * free (h-* and w-* resolve through spacing.mjs).
 *
 * **Micro row actions** (single-row: reprint one label, add one serial): use
 * `size="md"` (`h-8 w-8`) + `rounded-none` (already default) on the far-right
 * of a full-bleed hairline row. Prefer `tone="neutral"` with
 * `hover:bg-surface-sunken` at the call site when a ghost wash is needed.
 * Never put a primary blue text `Button` inside a repeating list row — that
 * is Macro work for {@link FlushTerminalFooter}.
 *
 * **Macro spread peers** (`FlushTerminalFooter` `layout="spread"`): use
 * `size="fill"` so every icon owns an equal full-height / full-width hit
 * column, with glyph `FLUSH_TERMINAL_SPREAD_GLYPH_CLASS` (`h-5 w-5`, same
 * rung as `touch`). Never `size="touch"` + justify-between dead air, and
 * never micro `h-4` glyphs on an h-11 fill peer.
 *
 * Never re-invent the box via className `h-*`/`w-*` — the control-size guard
 * ratchets those call sites (escape: `ds-allow-control-size` for genuinely
 * bespoke geometry).
 */
export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'touch' | 'fill';

const sizeClassName: Record<IconButtonSize, string> = {
  /** 24px — dense rail rows. */
  xs: 'h-6 w-6',
  /** 28px — compact toolbars. */
  sm: 'h-7 w-7',
  /** 32px — default chrome actions (rhymes Button sm). */
  md: 'h-8 w-8',
  /** 36px — headers / prominent actions (rhymes Button md). */
  lg: 'h-9 w-9',
  /** 44px — mobile tap floor (iOS HIG). */
  touch: 'h-11 w-11',
  /**
   * Macro spread peer — fills an equal column of {@link FlushTerminalFooter}
   * `layout="spread"` (Station Displays carton Macro golden).
   */
  fill: 'h-full min-h-0 w-full min-w-0 flex-1 self-stretch',
};

const toneClassName: Record<IconButtonTone, string> = {
  neutral: 'text-text-soft hover:text-text-default',
  accent: 'text-text-soft hover:text-blue-600',
};

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'title'> {
  icon: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel: string;
  title?: string;
  tone?: IconButtonTone;
  /** Fixed square hit-box from the control-size scale. Omit = legacy bare glyph-button. */
  size?: IconButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    onClick,
    className = '',
    ariaLabel,
    title,
    tone = 'neutral',
    size,
    disabled = false,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      // Marker for the scan-station floor-density control floor (globals.css →
      // `[data-density='floor'] [data-cf-control]` lifts the box to 44px). Only
      // SIZED buttons carry it — an unsized IconButton is a bare glyph with no
      // box by design, and giving it one would change every legacy call site.
      data-cf-control={size ? '' : undefined}
      className={cn(
        // Square hit wash — never a circular hover plate.
        'rounded-none transition-colors duration-100 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-35',
        // Keyboard focus ring from the SoT — IconButton had none (a11y gain);
        // :focus-visible so a mouse click never flashes it.
        focusRing('control', 'accent'),
        size && 'inline-flex shrink-0 items-center justify-center',
        size && sizeClassName[size],
        toneClassName[tone],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
