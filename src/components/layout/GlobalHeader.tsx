'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalScanDock } from './GlobalScanDock';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { HeaderDailyTasks } from './HeaderDailyTasks';
import { HeaderPageSwitcher } from './HeaderPageSwitcher';
import { HeaderPinsSwitcher } from './HeaderPinsSwitcher';
import { SidebarCollapseControl } from './SidebarCollapseControl';
import { ActivityInboxButton } from '@/components/quick-access/ActivityInboxButton';
import { GlobalHeaderAdd } from './GlobalHeaderAdd';
import {
  HEADER_ICON_CLUSTER,
  HEADER_INSET_X,
  TOP_CHROME_BAND_CLASS,
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
 *     screen corner. Then {@link HeaderDailyTasks} — between Search and Pins
 *     (operator 2026-09-16) — and {@link HeaderPinsSwitcher}, whose Pin glyph
 *     leads its own chip banner. Pins stay on this beam in both spine states
 *     so "Pin this page" and ⌘/Ctrl+1–9 do not vanish when the spine opens.
 *     Recents / actions / kiosk unmounted here — kiosk opens from
 *     {@link StaffAccountFooter} account details (sidebar bottom).
 *   - **Scan** — {@link GlobalScanDock}
 *   - **Floor page chip** — {@link HeaderPageSwitcher} (Scan Stations triage
 *     with the spine closed; desks stay on DeskPageChrome)
 *   - **Context** — page `panelContent`
 *   - **Actions** — a visible `+` starts shipping-label intake from every
 *     desktop page. The flow resolves an order first, displays it through the
 *     To-ship ledger, and keeps return and replacement purchases attached to
 *     that order. The activity inbox stays far right.
 *
 *     A standing beam seat is earned by FREQUENCY. `HeaderGoalChip` and
 *     `GlobalHeaderAssistantButton` stay unmounted for the same reason; both
 *     have named owners in
 *     `docs/todo/operator-reconnect-4-increments-PLAN.md`.
 *
 * No `surfaceRoute` for `/`. No session switcher.
 * Callers: ResponsiveLayout. API: none. Schemas: none.
 * User: "drop the kiosk button in the account details at the bottom of the
 * sidebar not in the top left of the global header."
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
      <div className={HEADER_ICON_CLUSTER} data-header-zone="nav">
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
        <HeaderDailyTasks />
        <HeaderPinsSwitcher />
      </div>

      <GlobalScanDock />
      <HeaderPageSwitcher />
      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>
      <div className={HEADER_ICON_CLUSTER} data-header-zone="actions">
        <GlobalHeaderAdd />
        <ActivityInboxButton />
      </div>
    </header>
  );
}
