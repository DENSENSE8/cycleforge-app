import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils/_cn';

/**
 * shadcn/ui Button (new-york), adopted 2026-08-24.
 *
 * Stock shadcn except where the shell's laws differ, and each deviation is
 * marked. The colour names resolve through the shadcn→plane alias block in
 * `globals.css`, so this inherits the plane inversion and both themes with
 * no palette of its own.
 *
 * DEVIATIONS FROM STOCK:
 *  · `transition-colors` only. Stock ships `transition-all`, which would
 *    tween width, padding and every other reflow property the moment a
 *    variant changed — M1's exact prohibition. Colour is the only thing
 *    here allowed to move.
 *  · No `shadow-xs` on the default/outline variants. LAW 3 permits two
 *    shadow tokens in this shell and neither is a control shadow; depth is
 *    a plane change and a 1px stroke.
 *  · `min-h-9` rather than a fixed `h-9`, so a wrapped label grows the
 *    control instead of overflowing it.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'min-h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'min-h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
