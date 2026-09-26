'use client';

/** shadcn/ui Input (new-york), restyled to house tokens. */

import * as React from 'react';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-mode-control border border-border-soft bg-surface-card px-3 py-1',
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
