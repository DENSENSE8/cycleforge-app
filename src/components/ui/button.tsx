'use client';

/** shadcn/ui Button (new-york), restyled to house tokens. */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';

const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    cornerClass('flush'),
    focusRing('control', 'accent'),
  ),
  {
    variants: {
      variant: {
        /** Quiet chrome — the default here. Reads as part of the bar it sits in. */
        ghost: 'text-text-muted hover:bg-surface-hover hover:text-text-default',
        /** Even quieter: an eyebrow-weight control (band labels, Collapse all). */
        eyebrow:
          'text-role-micro font-semibold uppercase tracking-widest text-text-faint hover:text-text-muted',
        /** A chrome control that has to read as a distinct cell — a band chip. */
        outline:
          'border border-border-soft bg-surface-card text-text-muted hover:bg-surface-hover hover:text-text-default',
        /** Selected / open state of a toggle. */
        active: 'bg-surface-sunken text-text-default hover:bg-surface-hover',
        /** shadcn's canonical primary action fill — the same accent family as the DS Button's `primary` (there is no `bg-primary` token here). */
        default:
          'bg-blue-600 font-semibold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500 active:bg-blue-700',
        /** shadcn's destructive action fill, house rose tones. */
        destructive: 'bg-rose-600 font-semibold text-white hover:bg-rose-500 active:bg-rose-700',
      },
      size: {
        // NOTE the missing `[&_svg]:size-*` on the two chrome sizes below.
        /** Eyebrow strips — no height of its own, so a hairline stays a hairline. */
        eyebrow: 'h-auto px-1 py-0',
        /** Bleeds its padding so it cannot grow the row it sits in. */
        iconTight: '-m-1 size-auto p-1',
        sm: 'h-6 px-2 text-role-micro [&_svg]:size-3.5',
        md: 'h-8 px-3 text-role-caption [&_svg]:size-4',
        /** Square icon-only chrome. */
        icon: 'size-6 p-0 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>` (tooltip / menu triggers). */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, asChild = false, type, ...props }, ref) {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        data-slot="button"
        // A chrome control inside a form must never submit it by accident.
        type={asChild ? type : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

export { buttonVariants };
