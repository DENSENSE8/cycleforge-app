'use client';

/**
 * shadcn/ui Sidebar (new-york), restyled to house tokens.
 * **Icon law (operator 2026-09-14: *"icon at the parent level only"*).** A glyph
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { useIsMobile } from '@/hooks/_ui';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import {
  SIDEBAR_SPINE_WIDTH_PX,
  SPINE_LABEL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import {
  SPINE_ACCENT,
  SPINE_ACCENT_DATA_ACTIVE,
} from '@/lib/nav/spine-section-accent';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/** Phone sheet width — the spine's pixel twin, capped by `max-w-[86vw]`. */
const SIDEBAR_WIDTH_MOBILE = `${SIDEBAR_SPINE_WIDTH_PX}px`;

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

/**
 * Owns open state for both presentations. `open` is controllable so the desk
 * host can hand its own persisted state down rather than keeping a second copy.
 */
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) setOpenProp(next);
      else setUncontrolledOpen(next);
    },
    [setOpenProp, open],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((prev) => !prev);
    else setOpen((prev) => !prev);
  }, [isMobile, setOpen]);

  const state = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
            ...style,
          } as React.CSSProperties
        }
        className={cn('group/sidebar-wrapper flex h-full min-h-0 w-full flex-col', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/** The nav tree, in whichever presentation the viewport calls for. */
function Sidebar({
  side = 'left',
  collapsible = 'none',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right';
  collapsible?: 'none' | 'sheet';
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile && collapsible === 'sheet') {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          side={side}
          showCloseButton={false}
          className={cn('w-(--sidebar-width-mobile) max-w-[86vw] p-0', appChromeClass, className)}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the navigation sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col text-text-default">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-sidebar="sidebar"
      data-state={state}
      data-side={side}
      className={cn('flex h-full min-h-0 w-full flex-col text-text-default', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex w-full shrink-0 flex-col', className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex w-full shrink-0 flex-col', className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip overscroll-contain',
        className,
      )}
      {...props}
    />
  );
}

/** One LANE. The group is the parent; its rows are the pages inside it. */
function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('group/section relative flex w-full min-w-0 flex-col', className)}
      {...props}
    />
  );
}

/** The group's name — and, under the icon law, the level that WEARS THE GLYPH. */
function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div';

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        // Same ink and same type role as a ROW (operator 2026-09-14:
        // Same ink and same type role as a ROW (operator 2026-09-14: the lane
        'flex min-w-0 w-full items-center gap-2 px-2 text-left text-text-default outline-hidden [&>svg]:size-4 [&>svg]:shrink-0',
        SPINE_ROW_FACE_CLASS,
        SPINE_LABEL_CLASS,
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('w-full', className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 list-none flex-col', className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  );
}

// Geometry comes from `SPINE_ROW_SHELL_CLASS` / `SPINE_ROW_FACE_CLASS` / `SPINE_LABEL_CLASS`; ink and fill come from `SPINE_ACCENT`.
const sidebarMenuButtonVariants = cva(
  cn(
    'peer/menu-button items-center gap-2 outline-hidden',
    SPINE_ROW_SHELL_CLASS,
    SPINE_LABEL_CLASS,
    SPINE_ACCENT.idlePage,
    SPINE_ACCENT_DATA_ACTIVE,
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
    focusRing('control', 'accent'),
  ),
  {
    variants: {
      // Hover lives in `SPINE_ACCENT.idlePage` — one source, not two.
      variant: {
        default: '',
      },
      size: {
        default: SPINE_ROW_FACE_CLASS,
        sm: 'h-8 shrink-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean;
  isActive?: boolean;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

/**
 * A count on a row. Omit it when the number is unknown — never paint a `0`,
 * which asserts "nothing here" on no evidence (`DeskPageTab.count` law).
 */
function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 select-none text-role-micro tabular-nums text-text-default',
        className,
      )}
      {...props}
    />
  );
}

/** A page's own CHILD MODES — **not** a lane's pages. */
function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        'flex min-w-0 list-none flex-col border-l border-border-soft',
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot : 'a';

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-active={isActive}
      className={cn(
        'min-w-0 items-center gap-2 outline-hidden [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        SPINE_ROW_SHELL_CLASS,
        SPINE_ROW_FACE_CLASS,
        SPINE_LABEL_CLASS,
        SPINE_ACCENT.childIdle,
        SPINE_ACCENT_DATA_ACTIVE,
        'aria-disabled:pointer-events-none aria-disabled:opacity-50',
        focusRing('control', 'accent'),
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  useSidebar,
};
