'use client';

/** shadcn/ui Skeleton, restyled to house tokens. */

import * as React from 'react';
import { cn } from '@/utils/_cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-none bg-surface-sunken', className)}
      {...props}
    />
  );
}

export { Skeleton };
