'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from '@/design-system/motion';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '../tokens/focus-ring';
import { cornerClass } from '../tokens/radius';
import { useUIModeOptional } from '../providers/UIModeProvider';
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
}

// ─── Variant classes ─────────────────────────────────────────────────────────

const variantClasses = BUTTON_VARIANTS;

// ─── Size classes ────────────────────────────────────────────────────────────

/** Solid CTAs are flush industrial squares — soft workbench pills opt in at call sites. */
const BUTTON_CORNER = cornerClass('flush');

const desktopSize: Record<ButtonSize, string> = {
  sm: cn('h-8 gap-1.5 px-3 text-role-caption', BUTTON_CORNER),
  md: cn('h-9 gap-1.5 px-3 text-role-data', BUTTON_CORNER),
  lg: cn('h-10 gap-2 px-4 text-sm', BUTTON_CORNER),
};

// Mobile — every size meets the 44px minimum touch target; same flush corner.
const mobileSize: Record<ButtonSize, string> = {
  sm: cn('h-11 gap-2 px-4 text-role-data', BUTTON_CORNER),
  md: cn('h-12 gap-2 px-5 text-sm', BUTTON_CORNER),
  lg: cn('h-14 gap-2.5 px-6 text-base', BUTTON_CORNER),
};

// Icon-only squares (mobile).
const mobileIconOnly: Record<ButtonSize, string> = {
  sm: cn('h-11 w-11', BUTTON_CORNER),
  md: cn('h-12 w-12', BUTTON_CORNER),
  lg: cn('h-14 w-14', BUTTON_CORNER),
};

const iconBox: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
};

const spring = { type: 'spring', stiffness: 520, damping: 36 } as const;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Button — the canonical button primitive.
 *
 * One component, seven variants (`primary` · `brand` · `secondary` · `ghost` ·
 * `danger` · `success` · `execute`). Replaces the ~1,300 hand-rolled
 * `<button className="bg-… px-… rounded-…">` scattered across the app.
 *
 * - Corner SoT: `cornerClass('flush')` → `rounded-none`. Soft workbench chrome
 *   CTAs add `WORKBENCH_CHROME_PILL_CLASS` at the call site.
 * - Children-based API: `<Button variant="brand" icon={<Plus />}>Save</Button>`
 * - Spring press feedback (framer-motion `whileTap`) on every variant
 * - Mode-aware: promotes to 44px+ touch targets on mobile via `UIModeProvider`
 * - Built-in `loading` (spinner swap) and `iconOnly` (mobile square) states
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
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
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={isIconOnly ? ariaLabel ?? (typeof children === 'string' ? children : undefined) : ariaLabel}
      aria-busy={loading || undefined}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      transition={spring}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold',
        'transition-colors duration-150 ease-out',
        // Focus affordance from the SoT (byte-identical to the old literal).
        focusRing('control', 'accent'),
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClass,
        className,
      )}
      {...(rest as HTMLMotionProps<'button'>)}
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
    </motion.button>
  );
});
