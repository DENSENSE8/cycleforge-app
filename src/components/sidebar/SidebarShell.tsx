'use client';

import { MasterNav, MasterNavProvider } from '@/components/sidebar/master-nav';
import { SidebarContextPanel } from '@/components/sidebar/SidebarContextPanel';
import { useHasSidebarContext } from '@/components/sidebar/useHasSidebarContext';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

export interface SidebarShellProps {
  /** Permission set used to filter the nav, or `undefined` to render unfiltered. */
  permissions: Set<string> | undefined;
  /** Restrict the nav for mobile devices. */
  mobileRestricted: boolean;
  /** Called when the user navigates (e.g. to close the slide-over). */
  onNavigate?: () => void;
  /** Inset the top for the mobile drawer notch / status bar. */
  inDrawer?: boolean;
  /**
   * Render the page list instead of the route's own sidebar. Set by the
   * slide-over; the resident column leaves it off.
   */
  navOnly?: boolean;
  /** Open the page-list slide-over (from the resident column's band chevron). */
  onOpenNav?: () => void;
}

/**
 * Host for the 40px identity band plus one body.
 *
 * Two mounts, and the body is decided by which one you are in — it never swaps:
 *
 * - **Resident column** — the route's OWN sidebar (`SidebarContextPanel`): the
 *   Media library's facet rail, Products' picker, the receiving rails. Present
 *   whenever the route has one, absent when it doesn't, which is what stops a
 *   panel-less surface reserving 360px of blank chrome.
 * - **Slide-over** (`navOnly`) — the page list, and only the page list.
 *
 * Station benches keep their scan bar + recents rail in the CONTENT region
 * instead, so they survive the nav being closed — `useHasSidebarContext` reports
 * false for them and they render no column here.
 *
 * `MasterNavProvider` marks that the nav owns page + mode, so ~14 route panels
 * suppress their own mode pill-row (`useMasterNavEnabled`).
 */
export function SidebarShell({
  permissions,
  mobileRestricted,
  onNavigate,
  inDrawer = false,
  navOnly = false,
  onOpenNav,
}: SidebarShellProps) {
  const routeHasContext = useHasSidebarContext();
  const hasContext = !navOnly && routeHasContext;

  return (
    <div
      className={cn(
        // No border-r / drop shadow when resident — the content shell
        // (`appContentShellClass`) owns the soft join. The slide-over adds its
        // own edge + elevation, because there it really is a floating layer.
        'flex h-full w-full flex-col overflow-hidden',
        appChromeClass,
        // In the mobile drawer, inset the top so the header clears the notch.
        inDrawer && 'pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))]',
      )}
    >
      <MasterNavProvider enabled>
        <MasterNav
          permissions={permissions}
          mobileRestricted={mobileRestricted}
          onNavigate={onNavigate}
          renderContext={() => <SidebarContextPanel />}
          hasContext={hasContext}
          onOpenNav={onOpenNav}
          className="flex-1 min-h-0"
        />
      </MasterNavProvider>
    </div>
  );
}
