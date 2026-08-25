import * as React from 'react';

import { cn } from '@/utils/_cn';

/** shadcn/ui Input (new-york). `transition-colors` for stock
 *  `transition-[color,box-shadow]`, and no `shadow-xs` (LAW 3). */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none transition-colors',
        'placeholder:text-muted-foreground file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
