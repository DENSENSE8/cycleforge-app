'use client';

/** shadcn/ui Label, restyled to house tokens. */

import * as React from 'react';
import { cn } from '@/utils/_cn';

/**
 * **Sentence case, not an eyebrow.** The house `typography/presets.ts` defines `fieldLabel` as `uppercase tracking-[0.16em]`, and this…
 * (Operator direction, 2026-08-31: "a more breathable font instead of caps
 */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- association is the caller's htmlFor/nesting
    <label
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-2 text-role-caption font-medium text-text-muted',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
