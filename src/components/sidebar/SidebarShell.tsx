'use client';

import type { ReactNode } from 'react';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MasterNav, MasterNavProvider } from '@/components/sidebar/master-nav';
import { SidebarContextPanel } from '@/components/sidebar/SidebarContextPanel';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

export interface SidebarShellProps {
  /** Permission set used to filter the nav, or `undefined` to render unfiltered. */
  permissions: Set<string> | undefined;
  /** Restrict the nav for mobile devices. */
  mobileRestricted: boolean;
  /** Called when the user navigates (e.g. to close a drawer). */
  onNavigate?: () => void;
  /** Inset the top for the mobile drawer notch / status bar. */
  inDrawer?: boolean;
}

/**
 * The single master sidebar nav — hovering the header trigger drops down the
 * active page's L2 modes; clicking it opens the full nav (grouped Main /
 * Stations / More). The `MasterNavProvider` tells panels rendered in
 * `renderContext` to hide their own mode pills (the header menus are the
 * single switcher).
 *
 * See docs/design-system/master-sidebar-nav-migration-plan.md.
 */
export function SidebarShell({
  permissions,
  mobileRestricted,
  onNavigate,
  inDrawer = false,
}: SidebarShellProps) {
  return (
    <aside
      className={cn(
        // No border-r / drop shadow — content shell (`appContentShellClass`) owns
        // the soft join (rounded-tl + border). A sidebar shadow casts a gray
        // strip into that cutout and competes with work-canvas depth.
        'flex h-full w-full flex-col overflow-hidden',
        appChromeClass,
        // In the mobile drawer, inset the top so the header clears the notch /
        // status bar (parity with the old drawer trigger).
        inDrawer && 'pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))]',
      )}
    >
      <MasterNavProvider enabled>
        <MasterNav
          permissions={permissions}
          mobileRestricted={mobileRestricted}
          onNavigate={onNavigate}
          renderContext={() => <SidebarContextPanel />}
          className="flex-1 min-h-0"
        />
      </MasterNavProvider>
    </aside>
  );
}

export interface MobileSidebarOverlayProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Full-screen mobile drawer overlay: a tap-to-dismiss backdrop, the sidebar
 * shell, and an explicit close button.
 */
export function MobileSidebarOverlay({ onClose, children }: MobileSidebarOverlayProps) {
  return (
    <div className="md:hidden fixed inset-0 z-panel">
      <button
        type="button"
        className="ds-raw-button absolute inset-0 bg-scrim/35"
        onClick={onClose}
        aria-label="Close sidebar overlay"
      />
      <div className="relative h-full max-w-[94vw]">{children}</div>
      <IconButton
        onClick={onClose}
        ariaLabel="Close sidebar"
        icon={<X className="h-5 w-5" />}
        className="absolute top-4 right-4 h-11 w-11 rounded-2xl bg-surface-card border border-border-emphasis text-text-muted shadow-lg shadow-gray-900/10 flex items-center justify-center"
      />
    </div>
  );
}
