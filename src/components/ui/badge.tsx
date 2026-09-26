'use client';

/** shadcn/ui Badge (new-york), restyled to house tokens. */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/_cn';

const badgeVariants = cva(
  cn(
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-mode-pill border px-1.5 py-0.5',
    'text-role-micro font-semibold leading-none',
    '[&>svg]:pointer-events-none [&>svg]:size-3',
  ),
  {
    variants: {
      variant: {
        default: 'border-transparent bg-surface-sunken text-text-default',
        secondary: 'border-border-soft bg-surface-card text-text-muted',
        outline: 'border-border-default bg-transparent text-text-muted',
        destructive: 'border-rose-200 bg-rose-50 text-rose-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
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
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
