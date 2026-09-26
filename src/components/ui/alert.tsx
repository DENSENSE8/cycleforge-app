'use client';

/** shadcn/ui Alert (new-york), restyled to house tokens. */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/_cn';

const alertVariants = cva(
  cn(
    'relative grid w-full items-start gap-x-2.5 gap-y-0.5 rounded-none border px-3.5 py-3 text-role-caption',
    'has-[>svg]:grid-cols-[auto_1fr] grid-cols-[0_1fr]',
    '[&>svg]:size-4 [&>svg]:translate-y-0.5',
  ),
  {
    variants: {
      variant: {
        default: 'border-border-soft bg-surface-card text-text-default',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        destructive: 'border-rose-200 bg-rose-50 text-rose-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 min-w-0 font-semibold leading-snug', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 min-w-0 text-role-caption opacity-90', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
