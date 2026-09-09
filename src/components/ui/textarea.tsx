'use client';

/**
 * shadcn/ui Textarea (new-york), restyled to house tokens.
 *
 * Sibling of `ui/input.tsx`: shadcn STRUCTURE (`data-slot`, prop pass-through),
 * house COLOUR. Required by Input Group's `InputGroupTextarea`.
 */

import * as React from 'react';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full border border-border-soft bg-surface-card px-3 py-2',
        'text-sm text-text-default outline-none transition-colors',
        'placeholder:text-text-faint selection:bg-surface-sunken',
        'disabled:cursor-not-allowed disabled:opacity-50',
        cornerClass('control'),
        focusRing('field', 'accent'),
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
