'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/utils/_cn';

/**
 * shadcn/ui Tooltip (new-york), adopted 2026-08-24.
 *
 * This is what replaces the native `title=` attribute on the icon rails.
 * A `title` tooltip is browser chrome: ~1s delay the operator cannot
 * change, no styling, and it never appears for a keyboard user at all.
 *
 * `delayDuration={300}` rather than stock 0 — an icon rail the pointer
 * crosses on the way somewhere else should not strobe labels.
 */
function TooltipProvider({ delayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-[1000] w-fit rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-elevated',
          'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
