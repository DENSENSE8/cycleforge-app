'use client';

/**
 * shadcn/ui Skeleton, restyled to house tokens.
 *
 * Upstream ships `animate-pulse`. That is an OPACITY animation, which
 * composites off the main thread and moves no neighbour, so it is inside the
 * house motion law (which bans geometry tweens, not opacity). Kept.
 */

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
