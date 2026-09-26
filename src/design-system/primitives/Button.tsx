'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '../tokens/focus-ring';
import { COMPOSER_SHELL_CORNER, cornerClass } from '../tokens/radius';
import { useUIModeOptional } from '../providers/UIModeProvider';
import { cursorClickTarget } from '@/design-system/motion/cursor-scrub';
import { BUTTON_VARIANTS, type ButtonVariant } from './button-variants';

export type { ButtonVariant } from './button-variants';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Button content. Hidden on mobile when `iconOnly` is set (label moves to aria-label). */
  children?: ReactNode;
  /** Visual variant. */
  variant?: ButtonVariant;
  /** Size — `md` is default. Mobile mode auto-promotes every size to a 44px+ touch target. */
  size?: ButtonSize;
  /** Leading icon node (e.g. `<Plus />`). Sized automatically by `size`. */
  icon?: ReactNode;
  /** Trailing icon node. Ignored while loading / icon-only. */
  iconRight?: ReactNode;
  /** Loading state — swaps content for a spinner and disables interaction. */
  loading?: boolean;
  /**
   * On mobile, render only the icon (square button). The text content becomes the
   * `aria-label`. Requires `icon`. On desktop the label stays visible.
   */
  iconOnly?: boolean;
  /** Accessible label — required when `iconOnly` and children aren't a plain string. */
  ariaLabel?: string;
  /**
   * Corner. Default `control` — the mode's control corner: 8px on a desktop
   * (triage), square on the phone floor (industrial) (owner 2026-09-26).
   */
  radius?: 'flush' | 'composer' | 'surface' | 'pill' | 'mode' | 'control';
}

// ─── Variant classes ─────────────────────────────────────────────────────────

const variantClasses = BUTTON_VARIANTS;

// ─── Size classes ────────────────────────────────────────────────────────────

const BUTTON_RADIUS: Record<NonNullable<ButtonProps['radius']>, string> = {
  flush: cornerClass('flush'),
  composer: COMPOSER_SHELL_CORNER,
  surface: cornerClass('surface'),
  pill: cornerClass('pill'),
  mode: 'rounded-mode',
  control: 'rounded-mode-control',
};

// The corner is NOT baked into these — it comes from `radius` below, so the
// two cannot disagree and a size can never silently re-flush a soft CTA.
const desktopSize: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-role-caption',
  md: 'h-9 gap-1.5 px-3 text-role-data',
  lg: 'h-10 gap-2 px-4 text-sm',
};

// Mobile — the `MOBILE_CONTROL_LADDER` rungs (28 / 36 / 44), not three sizes above the touch floor.
const mobileSize: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-role-caption',
  md: 'h-9 gap-2 px-4 text-role-data',
  lg: 'h-11 gap-2 px-5 text-sm',
};

// Icon-only squares (mobile) — same three rungs, square.
const mobileIconOnly: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

const iconBox: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
};

/** Press feedback is CSS, not the motion engine. */
const PRESS_FEEDBACK =
  'enabled:active:scale-[0.96] motion-reduce:transform-none';

// ─── Component ───────────────────────────────────────────────────────────────

/** Button — the canonical button primitive. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    radius = 'control',
    icon,
    iconRight,
    loading = false,
    iconOnly = false,
    ariaLabel,
    disabled = false,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  const { isMobile } = useUIModeOptional();
  const isDisabled = disabled || loading;
  const isIconOnly = isMobile && iconOnly && !!icon;

  const sizeClass = isIconOnly
    ? mobileIconOnly[size]
    : isMobile
      ? mobileSize[size]
      : desktopSize[size];

  const renderIcon = (node: ReactNode) => (
    <span className={cn('flex shrink-0 items-center justify-center', iconBox[size], '[&>svg]:h-full [&>svg]:w-full')}>
      {node}
    </span>
  );

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={isIconOnly ? ariaLabel ?? (typeof children === 'string' ? children : undefined) : ariaLabel}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold',
        'transition-[color,background-color,border-color,transform] duration-150 ease-out',
        PRESS_FEEDBACK,
        // Focus affordance from the SoT (byte-identical to the old literal).
        focusRing('control', 'accent'),
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClass,
        BUTTON_RADIUS[radius],
        className,
      )}
      {...(!isDisabled ? cursorClickTarget() : null)}
      {...rest}
    >
      {loading ? (
        <>
          {renderIcon(<Loader2 className="animate-spin" />)}
          {!isIconOnly && children}
        </>
      ) : (
        <>
          {icon && renderIcon(icon)}
          {!isIconOnly && children}
          {iconRight && !isIconOnly && renderIcon(iconRight)}
        </>
      )}
    </button>
  );
});
