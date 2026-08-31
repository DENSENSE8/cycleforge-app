'use client';

/**
 * shadcn/ui Input (new-york), restyled to house tokens.
 *
 * Sibling of `ui/button.tsx`: shadcn STRUCTURE (`data-slot`, prop
 * pass-through — `data-testid` and `inputMode` land on the element), house
 * COLOUR. The floating-label `design-system/primitives/TextField` remains the
 * flush industrial bar cell; this is the plain labeled field for shadcn-lane
 * surfaces (the order-intake overlay), paired with `ui/label.tsx`.
 */

import * as React from 'react';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-none border border-border-soft bg-surface-card px-3 py-1',
        'text-sm text-text-default outline-none transition-colors',
        'placeholder:text-text-faint selection:bg-surface-sunken',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        focusRing('field', 'accent'),
        className,
      )}
      {...props}
    />
  );
}

export { Input };
