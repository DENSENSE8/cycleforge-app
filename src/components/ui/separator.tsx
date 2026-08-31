'use client';

/**
 * shadcn/ui Separator, restyled to house tokens.
 *
 * Native element rather than `@radix-ui/react-separator` (not installed) —
 * shadcn's `data-slot` naming and orientation API are preserved, and the
 * decorative default carries `role`/`aria` exactly as the Radix part would.
 */

import * as React from 'react';
import { cn } from '@/utils/_cn';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}) {
  return (
    <div
      data-slot="separator"
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      data-orientation={orientation}
      className={cn(
        'shrink-0 bg-border-hairline',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
