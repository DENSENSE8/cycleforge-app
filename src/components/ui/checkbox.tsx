'use client';

/**
 * shadcn/ui Checkbox (Radix), restyled to house tokens.
 *
 * shadcn STRUCTURE (`data-slot`, Radix root + indicator), house COLOUR. The
 * checked fill uses the house primary accent — same tone family as the DS
 * Button's `primary` — because a bare `bg-primary` token does not exist here.
 * No animation: the indicator appears or it does not (AGENTS.md motion law).
 */

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-none border border-border-default bg-surface-card transition-colors',
        'data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white',
        'disabled:cursor-not-allowed disabled:opacity-50',
        focusRing('control', 'accent'),
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <Check className="size-3" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
