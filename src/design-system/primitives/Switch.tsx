'use client';

/**
 * Kinetic Ledger Switch — Radix Switch (shadcn-shaped) restyled to house tokens.
 * Prefer this over hand-rolled `role="switch"` thumbs in settings/admin.
 */

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
  /** Overrides the default `data-[state=checked]:bg-blue-600` (e.g. theme `bg-emerald-600`). */
  checkedClassName?: string;
};

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, checkedClassName = 'data-[state=checked]:bg-blue-600', ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
      'data-[state=unchecked]:bg-surface-strong',
      checkedClassName,
      'disabled:cursor-not-allowed disabled:opacity-50',
      focusRing('control'),
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-surface-card shadow transition-transform',
        'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
