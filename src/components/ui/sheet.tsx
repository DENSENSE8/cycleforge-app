'use client';

/**
 * shadcn/ui Sheet (new-york / Radix), restyled to house tokens.
 *
 * Sibling of `ui/dialog.tsx`: shadcn STRUCTURE (Radix Dialog parts,
 * `data-slot` naming), house COLOUR (`surface-*` / `text-*` / `border-*`,
 * `z-modal`, `bg-scrim`) — never the upstream `bg-background` palette, which
 * does not exist here.
 *
 * Built on `@radix-ui/react-dialog` directly, like `dialog.tsx`. The upstream
 * file imports the `radix-ui` umbrella package; this app installs the scoped
 * packages, so adding the umbrella would ship a second copy of the same
 * primitives.
 *
 * **No open/close animation on purpose** — the house motion law is "show it or
 * do not" (AGENTS.md). Upstream tweens `translate-x` on every side; nothing
 * here tweens a layout property.
 *
 * Exists for ONE consumer: the mobile branch of `ui/sidebar.tsx`, which swaps
 * the same nav tree into a side sheet under the `md` breakpoint. Do not reach
 * for it as a generic drawer — `BottomSheet` is the phone detail surface
 * (`ds_contract "phone list row opens a detail"`).
 */

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn('fixed inset-0 z-modal bg-scrim/60', className)}
      {...props}
    />
  );
}

/** Which edge the sheet is anchored to. */
type SheetSide = 'top' | 'right' | 'bottom' | 'left';

const SHEET_SIDE_CLASS: Record<SheetSide, string> = {
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r',
  right: 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l',
  top: 'inset-x-0 top-0 h-auto border-b',
  bottom: 'inset-x-0 bottom-0 h-auto border-t',
};

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide;
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-modal flex flex-col rounded-none border-border-soft bg-surface-card text-text-default',
          SHEET_SIDE_CLASS[side],
          elevationClass('overlay'),
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn(
              'absolute right-4 top-4 rounded-none p-1 text-text-muted opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none',
              focusRing('control'),
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-role-body font-semibold text-text-default', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-role-caption text-text-soft', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
