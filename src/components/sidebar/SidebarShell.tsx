'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { MasterNav, MasterNavProvider } from '@/components/sidebar/master-nav';
import { SidebarContextPanel } from '@/components/sidebar/SidebarContextPanel';
import {
  STATION_COLUMN_CARD_BOTTOM,
  STATION_COLUMN_CARD_TOP,
  STATION_COLUMN_CLASS,
} from '@/components/sidebar/station-column';
import { isStationSurfaceRoute } from '@/lib/sidebar-navigation';
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
 * The master sidebar column.
 *
 * - **Station surfaces** ({@link isStationSurfaceRoute}) → the two-card column
 *   (`station-column.ts`): a gray backdrop with the **nav card** flush to the
 *   top and the **station card** (recents + scan bar) flush to the bottom.
 *   Same shell, same width, same elevation, mirrored radii. They are flex
 *   siblings, so opening a nav menu expands the top card downward and pushes
 *   the station card down — the menus never cover the scan bar.
 * - **Everywhere else** → the classic single panel: master nav with the context
 *   panel as its body and menus floating over it.
 *
 * The **mobile drawer always keeps the classic panel**, on every route:
 * `GlobalHeader` doesn't exist on the mobile branch, so the drawer is the only
 * nav path there and it should not be re-shaped by desktop station chrome.
 *
 * `MasterNavProvider` stays on both paths — ~14 route panels read
 * `useMasterNavEnabled()` to suppress their own mode pill-row.
 *
 * See docs/design-system/master-sidebar-nav-migration-plan.md.
 */
export function SidebarShell({
  permissions,
  mobileRestricted,
  onNavigate,
  inDrawer = false,
}: SidebarShellProps) {
  const pathname = usePathname();
  const stationColumn = !inDrawer && isStationSurfaceRoute(pathname);

  if (stationColumn) {
    return (
      <aside className={STATION_COLUMN_CLASS}>
        <MasterNavProvider enabled>
          <div className={STATION_COLUMN_CARD_TOP}>
            {/* `docked`: menus render in flow and grow this card downward. */}
            <MasterNav
              permissions={permissions}
              mobileRestricted={mobileRestricted}
              onNavigate={onNavigate}
              layout="docked"
            />
          </div>

          <div className={STATION_COLUMN_CARD_BOTTOM}>
            <SidebarContextPanel />
          </div>
        </MasterNavProvider>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        // No border-r / drop shadow — content shell (`appContentShellClass`) owns
        // the soft join (rounded-tl + depth-edge hairline). A sidebar shadow
        // casts a gray strip into that cutout and competes with content depth.
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
