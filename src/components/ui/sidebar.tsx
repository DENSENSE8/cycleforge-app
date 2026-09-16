'use client';

/**
 * shadcn/ui Sidebar (new-york), restyled to house tokens.
 *
 * STRUCTURE is upstream — `SidebarProvider` / `Sidebar` / `SidebarContent` /
 * `SidebarGroup` / `SidebarGroupLabel` / `SidebarGroupContent` / `SidebarMenu` /
 * `SidebarMenuItem` / `SidebarMenuButton` / `SidebarMenuSub`, with `data-slot`
 * naming — because the operator asked for this component tree by name
 * (2026-09-14: *"the inbound and outbound should display the parents navigation
 * like this sidebar component as well, and they should all be under parents for
 * the sidebar"*).
 *
 * COLOUR, CORNERS, DENSITY and STATE are the spine's own tokens, never
 * literals: {@link SPINE_ROW_SHELL_CLASS} / {@link SPINE_ROW_FACE_CLASS} /
 * {@link SPINE_LABEL_CLASS} for geometry, {@link SPINE_ACCENT} +
 * {@link SPINE_ACCENT_DATA_ACTIVE} for ink and fill, {@link appChromeClass} for
 * the plane. The desktop spine, the phone drawer and the ⌘K palette are ONE row
 * system; every upstream `bg-sidebar` / `sidebar-accent` literal would be a
 * second source that lets them drift — and those tokens are not even defined in
 * this app's Tailwind theme.
 *
 * **Icon law (operator 2026-09-14: *"icon at the parent level only"*).** A glyph
 * marks a PARENT — an L0 `SidebarMenuButton`, or a `SidebarGroupLabel`. Rows
 * inside a group carry no glyph and wear the rail HAIRLINE on their left
 * instead (`spineRailLineClass`), which is the same child mark the `/m` drawer
 * uses — one law, one paint, both surfaces.
 *
 * ## What this copy does NOT ship, and why
 *
 * Upstream's desktop chrome is a `fixed` overlay panel with a spacer div, four
 * `variant`s and three `collapsible` modes. **This app's spine is a resident,
 * DRAG-RESIZABLE push column** ({@link SIDEBAR_SPINE_RESIZE}) with its own
 * edge handle, hover-peek card and persisted width. So:
 *
 * - `Sidebar` has two branches: the docked column (fills the host, which owns
 *   the measurement) and the phone sheet. No `offcanvas` / `icon` /
 *   `floating` / `inset` — the host answers all four questions already, and a
 *   second answer is how two sources of truth start.
 * - **No `SidebarRail` and no `SidebarTrigger`.** The edge handle and the
 *   collapse gesture belong to the host; a rail here would be a second
 *   affordance on the same pixel.
 * - **No `⌘B`, no cookie.** The host owns open state and persistence. This also
 *   settles the collision question: the provider binds no chord, so it cannot
 *   argue with `⌘;` (nav leader) or `⌘1-9` (pins).
 * - **No `tooltip` prop.** The house hint is `HoverTooltip`; wrap the row.
 * - **Not ported:** `SidebarInput`, `SidebarInset`, `SidebarSeparator`,
 *   `SidebarGroupAction`, `SidebarMenuAction`, `SidebarMenuSkeleton`. The first
 *   five have no consumer here (no search field, no inset main, no group
 *   affordances), and the skeleton picks a `Math.random()` width during render,
 *   which is a guaranteed hydration mismatch. Add one back when a surface needs
 *   it — do not fork this file.
 *
 * `--sidebar-width-mobile` is {@link SIDEBAR_SPINE_WIDTH_PX} capped at `86vw`:
 * the phone drawer is the spine's pixel twin, not shadcn's `18rem`.
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

/**
 * The nav tree, in whichever presentation the viewport calls for.
 *
 * `collapsible="none"` is the docked column: it fills the host, because the
 * host is what owns (and persists, and lets the operator drag) the width.
 * Under `md` the same children move into a side sheet — one component, two
 * presentations, which is SURFACE_LAW §4's frame law expressed in a primitive.
 */
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

/**
 * The group's name — and, under the icon law, the level that WEARS THE GLYPH.
 * Pass the lane icon as a child; `[&>svg]:size-4` matches
 * {@link SPINE_ROW_ICON_CLASS}.
 *
 * `asChild` is how this becomes a disclosure trigger: the spine's lanes
 * collapse, so the label is a `<button>` there rather than a `<div>`.
 */
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
        // Same ink and same type role as a ROW (operator 2026-09-14: the lane
        // headers "should display all black, all consistent with the top three
        // items"). Upstream greys the group label (`text-muted-foreground`) to
        // push it behind its rows; here the lane header IS a destination the
        // operator reads and clicks, so a quieter ink read as disabled.
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

// Geometry comes from `SPINE_ROW_SHELL_CLASS` / `SPINE_ROW_FACE_CLASS` /
// `SPINE_LABEL_CLASS`; ink and fill come from `SPINE_ACCENT`. Both are the
// spine's own tokens, not literals in this vendored variant — the desktop list,
// the phone drawer, the drag overlay and the ⌘K palette are ONE row system, and
// every literal here would be a second source that lets them drift.
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

/**
 * A page's own CHILD MODES — **not** a lane's pages.
 *
 * A lane's pages are `SidebarMenuItem`s in its `SidebarMenu`; this is where a
 * `SidebarPageNav.children` list goes for a page that is NOT `deskChrome`. A
 * desk that tabs its own pages must never get one: that would state the same
 * navigation twice.
 */
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
