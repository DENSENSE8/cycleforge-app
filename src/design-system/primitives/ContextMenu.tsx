'use client';

/**
 * Kinetic Ledger ContextMenu — Radix ContextMenu (shadcn-shaped) restyled to
 * house tokens. Prefer this over hand-rolled portal right-click menus.
 */

import * as React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        'z-popover max-h-[var(--radix-context-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-lg border border-border-soft bg-surface-card p-1 text-text-default',
        elevationClass('overlay'),
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
    tone?: 'default' | 'danger';
  }
>(({ className, inset, tone = 'default', ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm outline-none',
      'focus:bg-surface-canvas data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      tone === 'danger' && 'text-rose-600 focus:bg-rose-50 focus:text-rose-700',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
};
