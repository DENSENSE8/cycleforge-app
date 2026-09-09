'use client';

/**
 * shadcn/ui Command (new-york / cmdk), restyled to house tokens.
 * {@link CommandDialog} is the centered find palette shell for {@link CommandBar}.
 */

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from '@/components/Icons';
import { Dialog, DialogContent, DialogTitle } from '@/design-system/components/Dialog';
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

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
    /** Combobox header accessory (All staff). Never forwarded to the input. */
    trailing?: React.ReactNode;
  }
>(function CommandInput({ className, trailing, ...props }, ref) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b border-border-hairline px-3"
    >
      <Search className="size-4 shrink-0 text-text-faint" />
      <CommandPrimitive.Input
        ref={ref}
        data-slot="command-input"
        className={cn(
          'flex h-9 min-w-0 w-full flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-text-faint disabled:opacity-50',
          className,
        )}
        {...props}
      />
      {trailing}
    </div>
  );
});
CommandInput.displayName = 'CommandInput';

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

function CommandDialog({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName="z-command bg-scrim/40 backdrop-blur-md"
        onOpenAutoFocus={(e) => {
          // cmdk owns focus; prevent Radix from focusing the dialog chrome.
          e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
        className={cn(
          'left-1/2 top-[12vh] z-command max-h-[70vh] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 translate-y-0 gap-0 overflow-hidden rounded-2xl border-border-soft p-0 md:top-[16vh]',
          className,
        )}
      >
        <DialogTitle className="sr-only">Find records</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
