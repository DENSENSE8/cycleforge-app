import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/_cn';

/** shadcn/ui Alert (new-york). `rounded-lg` maps to `--r-surface`. */
const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_1fr] items-center gap-2 rounded-lg border px-3 py-2 text-xs [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        warning: 'border-edge-warning bg-surface-warning text-ink-warning',
        destructive: 'border-edge-danger bg-surface-danger text-ink-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-medium', className)} {...props} />;
}

export { Alert, AlertTitle, alertVariants };
