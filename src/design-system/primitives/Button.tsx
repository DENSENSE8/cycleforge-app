'use client';

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '../tokens/focus-ring';
import { COMPOSER_SHELL_CORNER, cornerClass } from '../tokens/radius';
import { TACTILE_DEPTH_CLASS } from '../tokens/shadows';
import { useUIModeOptional } from '../providers/UIModeProvider';
import { cursorClickTarget } from '@/design-system/motion/cursor-scrub';
import { BUTTON_DEPTH_EDGE, BUTTON_VARIANTS, type ButtonVariant } from './button-variants';

export type { ButtonVariant } from './button-variants';

// ─── Types ───────────────────────────────────────────────────────────────────

/** `xl` is the chunky full-width job CTA (56px) — pair it with `depth`. */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

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
   * and follows the region's control radius.
   */
  radius?: 'flush' | 'composer' | 'surface' | 'pill' | 'mode' | 'control';
  /**
   * Chunky pressed depth: a hard bottom ledge in the fill's deeper ink; press
   * sinks the face onto it. For the one big job CTA (`size="xl"`,
   * `radius="mode"` or `"pill"`), never for toolbar or row buttons.
   */
  depth?: boolean;
  /**
   * External link: renders an `<a>` with the button's face that opens `href`
   * in a new tab (`noopener noreferrer`). Ignored while `disabled` / `loading`.
   */
  href?: string;
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
  xl: 'h-12 gap-2 px-6 text-base',
};

// Mobile — the `MOBILE_CONTROL_LADDER` rungs (28 / 36 / 44) plus the 56px job CTA.
const mobileSize: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-role-caption',
  md: 'h-9 gap-2 px-4 text-role-data',
  lg: 'h-11 gap-2 px-5 text-sm',
  xl: 'h-14 gap-2 px-6 text-base',
};

// Icon-only squares (mobile) — same three rungs, square.
const mobileIconOnly: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
  xl: 'h-14 w-14',
};

const iconBox: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
  xl: 'h-5 w-5',
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
    depth = false,
    className,
    type = 'button',
    href,
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

  const face = cn(
    'inline-flex select-none items-center justify-center font-semibold',
    'transition-[color,background-color,border-color,transform] duration-150 ease-out',
    !depth && PRESS_FEEDBACK,
    // Focus affordance from the SoT (byte-identical to the old literal).
    focusRing('control', 'accent'),
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClasses[variant],
    // After the fill: the ledge replaces the variant's soft shadow + tint.
    depth && cn(TACTILE_DEPTH_CLASS, BUTTON_DEPTH_EDGE[variant]),
    sizeClass,
    BUTTON_RADIUS[radius],
    className,
  );
  const label = isIconOnly ? ariaLabel ?? (typeof children === 'string' ? children : undefined) : ariaLabel;
  const content = loading ? (
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
  );

  if (href && !isDisabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        // `enabled:` never matches an anchor — the press feedback, unconditioned.
        className={cn(face, !depth && 'active:scale-[0.96] motion-reduce:transform-none')}
        {...cursorClickTarget()}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={label}
      aria-busy={loading || undefined}
      className={face}
      {...(!isDisabled ? cursorClickTarget() : null)}
      {...rest}
    >
      {content}
    </button>
  );
});
