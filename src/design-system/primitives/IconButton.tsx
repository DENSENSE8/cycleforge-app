'use client';

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { focusRing } from '../tokens/focus-ring';
import { cornerClass, TRIAGE_PANEL_INNER_CORNER } from '../tokens/radius';

type IconButtonTone = 'neutral' | 'accent' | 'glass';

/** Box-size contract (control-size axis). */
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

/**
 * `glass` matches `BUTTON_VARIANTS.glass` — chrome ON LIVE MEDIA, ink only.
 * The bar it rides owns the scrim (one alpha per row, not three), and
 * `neutral`'s `text-text-soft` would disappear over a white shipping label.
 */
const toneClassName: Record<IconButtonTone, string> = {
  neutral: 'text-text-soft hover:text-text-default',
  accent: 'text-text-soft hover:text-blue-600',
  glass: 'text-white hover:bg-glass/20',
};

interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'title'> {
  icon: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel: string;
  title?: string;
  tone?: IconButtonTone;
  /** Fixed square hit-box from the control-size scale. Omit = legacy bare glyph-button. */
  size?: IconButtonSize;
  /**
   * Corner. Default `flush` — the zero-radius ops law.
   * `control` is `TRIAGE_PANEL_INNER_CORNER` — follows the region: rounded on desk records, square on phones.
   * `surface` is `cornerClass('surface')` for mobile chrome beside inset-grouped cards.
   * `pill` is `cornerClass('pill')` — a circle in every region.
   * `modePill` is `rounded-mode-pill`.
   */
  radius?: 'flush' | 'control' | 'surface' | 'pill' | 'modePill';
}

const ICON_BUTTON_RADIUS: Record<NonNullable<IconButtonProps['radius']>, string> = {
  flush: cornerClass('flush'),
  control: TRIAGE_PANEL_INNER_CORNER,
  surface: cornerClass('surface'),
  pill: cornerClass('pill'),
  modePill: 'rounded-mode-pill',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    onClick,
    className = '',
    ariaLabel,
    title,
    tone = 'neutral',
    size,
    radius = 'flush',
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
      // Marker for the scan-station floor-density control floor (globals.css → `[data-density='floor'] [data-cf-control]` lifts the box to 44px).
      data-cf-control={size ? '' : undefined}
      className={cn(
        'transition-colors duration-100 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-35',
        // Keyboard focus ring from the SoT — IconButton had none (a11y gain);
        // :focus-visible so a mouse click never flashes it.
        focusRing('control', 'accent'),
        size && 'inline-flex shrink-0 items-center justify-center',
        size && sizeClassName[size],
        toneClassName[tone],
        ICON_BUTTON_RADIUS[radius],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
