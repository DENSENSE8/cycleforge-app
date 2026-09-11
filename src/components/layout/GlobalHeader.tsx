'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalScanDock } from './GlobalScanDock';
import { GlobalHeaderKioskButton } from './GlobalHeaderKioskButton';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { HeaderPageSwitcher } from './HeaderPageSwitcher';
import { HeaderPinsSwitcher } from './HeaderPinsSwitcher';
import { SidebarCollapseControl } from './SidebarCollapseControl';
import {
  HEADER_ICON_CLUSTER,
  HEADER_INSET_X,
  TOP_CHROME_BAND_CLASS,
  TOP_CHROME_NAV_LEAD,
  TOP_CHROME_ZONE_GAP,
} from './header-shell';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Global desktop header — one persistent bar mounted once in
 * {@link ResponsiveLayout}, above the page's `<main>`.
 *
 * Zone contract (left → right):
 *   - **Nav** — toggle + Search while the spine is closed. Open, the same
 *     pair lives on the spine top band ({@link SpineNavChrome}) at the same
 *     screen corner. Staff pins ({@link HeaderPinsSwitcher}) stay on this
 *     beam in both states so "Pin this page" and ⌘/Ctrl+1–9 do not vanish
 *     when the spine opens. Legacy GlobalHeaderActions stays unmounted (files
 *     kept); only the kiosk opener remounts far-right.
 *   - **Scan** — {@link GlobalScanDock}
 *   - **Floor page chip** — {@link HeaderPageSwitcher} (Scan Stations triage
 *     with the spine closed; desks stay on DeskPageChrome)
 *   - **Context** — page `panelContent`
 *   - **Kiosk** — {@link GlobalHeaderKioskButton} far-right (`/kiosk/v2`)
 *
 * No `surfaceRoute` for `/`. No session switcher.
 * Callers: ResponsiveLayout. API: none. Schemas: none.
 * User: "there must be a way to access the kisok from the bottom left side or
 * the top right of the global header which ever would be best"
 */
export function GlobalHeader({
  navOpen,
  onToggleNav,
  peeking = false,
  peekTriggerProps,
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  peeking?: boolean;
  peekTriggerProps?: { onMouseEnter?: () => void; onMouseLeave?: () => void };
}) {
  const { panelContent } = useHeader();
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user || isClientPublicPath(pathname)) return null;

  return (
    <header
      className={cn(
        TOP_CHROME_BAND_CLASS,
        'sticky top-0 z-header w-full select-none backdrop-blur-sm',
        TOP_CHROME_ZONE_GAP,
        HEADER_INSET_X,
        appChromeMutedClass,
      )}
    >
      <div
        className={cn(HEADER_ICON_CLUSTER, !navOpen && TOP_CHROME_NAV_LEAD)}
        data-header-zone="nav"
      >
        {!navOpen && (
          <>
            <SidebarCollapseControl
              navOpen={navOpen}
              onToggleNav={onToggleNav}
              peeking={peeking}
              peekTriggerProps={peekTriggerProps}
            />
            <GlobalHeaderSearch />
          </>
        )}
        <HeaderPinsSwitcher />
      </div>

      <GlobalScanDock />
      <HeaderPageSwitcher />
      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>
      <div
        className={cn(HEADER_ICON_CLUSTER, 'ml-auto')}
        data-header-zone="kiosk"
      >
        <GlobalHeaderKioskButton />
      </div>
    </header>
  );
}
