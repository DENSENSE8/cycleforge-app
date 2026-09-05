'use client';

/**
 * Kinetic Ledger ContextMenu — Radix ContextMenu (shadcn-shaped) restyled to
 * house tokens. Prefer this over hand-rolled portal right-click menus.
 *
 * Rows consume {@link MENU_ITEM_TONE_CLASS} — the same map as DropdownMenuItem
 * and Popover menuitems — so status pills vs accent ink cannot drift.
 */

import * as React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import {
  MENU_ITEM_ROW_CLASS,
  MENU_ITEM_TONE_CLASS,
  MENU_SEPARATOR_CLASS,
  type MenuItemTone,
} from '@/design-system/tokens/menu-tone';

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        'z-popover max-h-[var(--radix-context-menu-content-available-height)] min-w-[10rem] overflow-y-auto overflow-x-hidden border border-border-soft bg-surface-card p-1 text-text-default',
        DROPDOWN_SHELL_CORNER,
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
    tone?: MenuItemTone;
  }
>(({ className, inset, tone = 'default', ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(MENU_ITEM_ROW_CLASS, MENU_ITEM_TONE_CLASS[tone], inset && 'pl-8', className)}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      MENU_ITEM_ROW_CLASS,
      MENU_ITEM_TONE_CLASS.default,
      'pl-8 pr-2',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn(MENU_SEPARATOR_CLASS, className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      MENU_ITEM_ROW_CLASS,
      MENU_ITEM_TONE_CLASS.default,
      'data-[state=open]:bg-surface-hover',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-faint" />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={cn(
        'z-popover min-w-[8rem] overflow-hidden border border-border-soft bg-surface-card p-1 text-text-default',
        DROPDOWN_SHELL_CORNER,
      elevationClass('overlay'),
      className,
    )}
    {...props}
  />
));
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
