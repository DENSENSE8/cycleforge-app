'use client';
import * as React from 'react';
import { cn } from '@/utils/_cn';

/** shadcn/ui Label (new-york) — without `@radix-ui/react-label`. That
 *  package exists to forward a click to the control when `htmlFor` is
 *  absent; every label in this shell has an explicit `htmlFor`, which the
 *  platform already handles. A dependency for nothing. */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('flex select-none items-center gap-2 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}
export { Label };
