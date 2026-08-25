'use client';

import * as React from 'react';

import { cn } from '@/utils/_cn';

/**
 * shadcn/ui Separator (new-york), adopted 2026-08-24 — WITHOUT its Radix
 * dependency, deliberately.
 *
 * Stock wraps `@radix-ui/react-separator`, whose only job is to stamp
 * `role="separator"` / `aria-orientation` and mark decorative instances
 * `role="none"`. The shell's one vertical separator is a DRAG HANDLE: it
 * owns `tabIndex`, `aria-valuenow/min/max` and pointer handlers, none of
 * which Radix's decorative primitive models. Pulling a package in to
 * re-emit two attributes this component already sets — and then fighting
 * it over the ARIA — is a dependency for nothing.
 *
 * `decorative` keeps stock's semantics: decorative separators are hidden
 * from the accessibility tree rather than announced as structure.
 */
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
      data-orientation={orientation}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
