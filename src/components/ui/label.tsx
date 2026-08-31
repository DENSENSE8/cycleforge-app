'use client';

/**
 * shadcn/ui Label, restyled to house tokens.
 *
 * Implemented on the native `<label>` rather than `@radix-ui/react-label`
 * (not installed; the radix part only adds double-click text-selection
 * suppression). Keeps shadcn's `data-slot` naming and peer-disabled styling so
 * a generated call site drops in unchanged.
 */

import * as React from 'react';
import { cn } from '@/utils/_cn';

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- association is the caller's htmlFor/nesting
    <label
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-2 text-role-micro font-semibold uppercase tracking-wide text-text-soft',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
