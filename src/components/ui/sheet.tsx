'use client';

/** shadcn/ui Sheet (new-york / Radix), restyled to house tokens. */

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useKeyboard } from '@/hooks/useKeyboard';

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
  // THE phone sheet (V2_OBJECT_FIRST.md §5): content-sized, capped below the
  // status bar so the scrim stays tappable; on a wide viewport it floats as a
  // phone-width card at the bottom centre (SURFACE_LAW §4 frame law).
  bottom: cn(
    'inset-x-0 bottom-0 h-auto max-h-[calc(100dvh-2.5rem)] overflow-hidden rounded-t-2xl border-t',
    'md:inset-x-auto md:bottom-4 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:rounded-2xl md:border',
    // Enter: rise from the thumb edge on a phone, fade on a wide viewport. The
    // enter keyframe's `from` transform must keep the centring translate. Reduced motion: none.
    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 max-md:data-[state=open]:slide-in-from-bottom md:[--tw-enter-translate-x:-50%] motion-reduce:data-[state=open]:animate-none',
  ),
};

/** `full` — a bottom sheet that owns the whole screen (a long form, a brief); top safe area padded. */
const SHEET_BOTTOM_FULL_CLASS =
  'top-0 max-h-none rounded-none pt-[env(safe-area-inset-top)] md:top-4 md:max-h-[calc(100dvh-2rem)] md:rounded-2xl md:pt-0';

function SheetContent({
  className,
  children,
  side = 'right',
  size = 'content',
  showCloseButton = true,
  style,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide;
  /** Bottom sheets only: `content` sizes to its body (default), `full` fills the screen. */
  size?: 'content' | 'full';
  showCloseButton?: boolean;
}) {
  const full = side === 'bottom' && size === 'full';
  // F10 (V2_OBJECT_FIRST §4): an overlay keyboard (iOS) covers a fixed bottom
  // sheet instead of moving it, hiding the field being typed in. Ride the keys
  // and cap the sheet to what is still visible above them.
  const { keyboardHeight, visibleHeight } = useKeyboard();
  const lift: React.CSSProperties | undefined =
    side === 'bottom' && keyboardHeight > 0
      ? { bottom: keyboardHeight, maxHeight: full ? undefined : `calc(${visibleHeight}px - 2.5rem)` }
      : undefined;
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-modal flex flex-col rounded-none border-border-soft bg-surface-card text-text-default',
          SHEET_SIDE_CLASS[side],
          full && SHEET_BOTTOM_FULL_CLASS,
          elevationClass('overlay'),
          className,
        )}
        style={lift ? { ...style, ...lift } : style}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn(
              // 44 px hit box (F3): the 16 px glyph centred in a touch square.
              'absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-none text-text-muted opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none',
              full && 'top-[max(0.25rem,env(safe-area-inset-top))] md:top-1',
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

/**
 * The scrolling body of a bottom sheet: page inset, its own scroll, and the
 * bottom safe area — unless a `DetailDock placement="sheet"` floor follows,
 * which owns the safe area itself.
 */
function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-mode-page pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        '[&:has(+[data-dock=sheet])]:pb-3',
        className,
      )}
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
  SheetBody,
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
