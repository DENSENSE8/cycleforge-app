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
 * Host for the identity band plus the page list.
 *
 * **One body, always: section drills.** A route's own sidebar mounts in the
 * content region beside the workspace (`ContextPanelLayout`).
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
