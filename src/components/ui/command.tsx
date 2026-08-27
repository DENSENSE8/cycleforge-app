'use client';

/**
 * shadcn/ui Command (new-york / cmdk), restyled to house tokens.
 * No CommandDialog — ⌘K belongs to CommandBar
 * (`src/components/layout/cmdk-owner.guard.test.ts`).
 */

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from '@/components/Icons';
import { cn } from '@/utils/_cn';

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex size-full flex-col overflow-hidden bg-surface-card text-text-default',
        className,
      )}
      {...props}
    />
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b border-border-hairline px-3"
    >
      <Search className="size-4 shrink-0 text-text-faint" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-text-faint disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-80 scroll-py-1 overflow-y-auto overflow-x-hidden p-0', className)}
      {...props}
    />
  );
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="px-3 py-3 text-center text-role-micro text-text-muted"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-0 text-text-default',
        '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-1.5',
        '[&_[cmdk-group-heading]]:text-role-micro [&_[cmdk-group-heading]]:font-semibold',
        '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest',
        '[&_[cmdk-group-heading]]:text-text-faint',
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-0 h-px bg-border-hairline', className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-none px-3 py-2 text-sm outline-none',
        'data-[selected=true]:bg-surface-hover data-[selected=true]:text-text-default',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('ml-auto text-role-micro tracking-widest text-text-faint', className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
