'use client';

import { MasterNav } from '@/components/sidebar/master-nav';
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
}

/**
 * Host for the 40px identity band plus the page list.
 *
 * **One body, always: the page list.** A route's own sidebar is no longer a body
 * this shell can render — it mounts in the content region beside the workspace
 * (`ContextPanelLayout`), the shape the station benches always had. What that
 * removes is a whole class of conflict: the navigator and the route's picker used
 * to share this column, so opening one took away the other, and a route with no
 * picker (the Media library) left the navigator painting over the work canvas.
 *
 */
export function SidebarShell({
  permissions,
  mobileRestricted,
  onNavigate,
  inDrawer = false,
}: SidebarShellProps) {
  return (
    <div
      className={cn(
        // No edge or elevation here — the spine's host (`SidebarNavColumn` on
        // desktop, the drawer on mobile) owns those.
        'flex h-full w-full flex-col overflow-hidden',
        appChromeClass,
        // In the mobile drawer, inset the top so the header clears the notch.
        inDrawer && 'pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))]',
      )}
    >
      <MasterNav
        permissions={permissions}
        mobileRestricted={mobileRestricted}
        onNavigate={onNavigate}
        className="flex-1 min-h-0"
      />
    </div>
  );
}
