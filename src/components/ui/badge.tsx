import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils/_cn';

/**
 * shadcn/ui Badge (new-york), adopted 2026-08-24.
 *
 * DEVIATIONS FROM STOCK:
 *  · `transition-colors`, not `transition-all` (M1).
 *  · The three urgency variants below are ADDITIONS, not overrides. D16's
 *    urgency marker is three-valued (now / today / queued) and the stock
 *    variant set has no vocabulary for it. They are text-only — colour is
 *    the verdict, and a filled pill beside a filled CTA is two competing
 *    fills in one 360px column.
 *  · `rounded-md` rather than stock `rounded-full`: LAW 1's amended scale
 *    has no pill radius, and `--r-circle` is an enumerated two-entry exception.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors [&>svg]:size-3 [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        /* D16 urgency — condensed, uppercase, no fill. */
        now: 'border-transparent px-0 font-condensed text-technical font-bold uppercase tracking-[0.1em] text-ink-danger',
        today:
          'border-transparent px-0 font-condensed text-technical font-bold uppercase tracking-[0.1em] text-ink-warning',
        queued:
          'border-transparent px-0 font-condensed text-technical font-bold uppercase tracking-[0.1em] text-ink-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
