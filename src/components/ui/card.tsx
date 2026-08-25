import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/utils/_cn';

/**
 * shadcn/ui Card (new-york), adopted 2026-08-24.
 *
 * DEVIATIONS FROM STOCK:
 *  · No `shadow-sm` on the root. LAW 3: depth is a plane change plus a
 *    1px stroke, and the two shadow tokens that exist are spoken for.
 *  · `rounded-lg` rather than stock `rounded-xl`, which maps to
 *    `--r-surface` (8px) — the card radius the shell already uses. `xl`
 *    is reserved for `--r-pane`, the 16px floating pane.
 *  · `py-6`/`gap-6` relaxed to `py-3`/`gap-2`: this is a high-density
 *    warehouse queue, not a marketing card.
 *  · `asChild` ADDED. Stock `Card` is always a <div>, which forces a card
 *    that is entirely one action (the parked-session row) to nest a
 *    button inside a div — two boxes, and the tap target on the inner
 *    one. `asChild` merges the card's classes onto the caller's element
 *    so the row is a single <button>. Same Slot mechanism shadcn already
 *    uses on Button and Badge, so this is their idiom, not a new one.
 */
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      data-slot="card"
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-card py-3 text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1 px-3', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('text-sm font-medium leading-tight', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-description" className={cn('text-xs text-muted-foreground', className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-3', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center gap-2 px-3', className)} {...props} />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
