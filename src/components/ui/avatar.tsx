'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '@/utils/_cn';

/**
 * shadcn/ui Avatar (new-york), adopted 2026-08-24.
 *
 * `rounded-circle` rather than stock `rounded-full`: this is the single
 * circle exception — see its docblock for the other entry, `--r-circle` (tokens.css, LAW 1's enumerated
 * exception). Same 50%, but reached through the token that argues for it.
 */
function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-6 shrink-0 overflow-hidden rounded-circle', className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image data-slot="avatar-image" className={cn('aspect-square size-full', className)} {...props} />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-circle bg-primary font-condensed text-[9px] font-bold tracking-wide text-primary-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
