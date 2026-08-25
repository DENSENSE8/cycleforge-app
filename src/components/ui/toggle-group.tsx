'use client';
import * as React from 'react';
import { cn } from '@/utils/_cn';

/**
 * A minimal segmented control in the shadcn idiom — this replaces the
 * shell's `.mode-toggle`, a row of `<span>`s and `<button>`s glued with
 * `border-left` rules.
 *
 * Not `@radix-ui/react-toggle-group`: that primitive's value is roving
 * focus and multi-select across an arbitrary set, and these are two- and
 * three-way single-select preference switches where native radio
 * semantics are both simpler and more accurate for a screen reader.
 */
function ToggleGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="toggle-group"
      role="radiogroup"
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  active,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      data-slot="toggle-group-item"
      role="radio"
      aria-checked={active}
      data-state={active ? 'on' : 'off'}
      className={cn(
        'inline-flex min-h-7 items-center justify-center rounded-sm px-2.5 text-xs font-medium transition-colors',
        'data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground',
        'data-[state=on]:bg-card data-[state=on]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
