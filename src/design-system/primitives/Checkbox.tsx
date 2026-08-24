'use client';

/**
 * Kinetic Ledger Checkbox — Radix Checkbox (shadcn-shaped) restyled to house tokens.
 */

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-border-strong bg-surface-card shadow-sm',
      'data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white',
      'data-[state=indeterminate]:border-blue-600 data-[state=indeterminate]:bg-blue-600 data-[state=indeterminate]:text-white',
      'disabled:cursor-not-allowed disabled:opacity-50',
      focusRing('control'),
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('grid place-content-center text-current')}>
      <Check className="h-3 w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
