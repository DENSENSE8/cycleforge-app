'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeaderActions } from './GlobalHeaderActions';
import { GlobalScanDock } from './GlobalScanDock';
import { HeaderPageSwitcher } from './HeaderPageSwitcher';
import { HeaderPinsSwitcher } from './HeaderPinsSwitcher';
import { HeaderRecentsSwitcher } from './HeaderRecentsSwitcher';
import {
  HEADER_ICON_CLUSTER,
  HEADER_INSET_X,
  TOP_CHROME_BAND_CLASS,
} from './header-shell';
import { SidebarCollapseControl } from './SidebarCollapseControl';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Global desktop header — one persistent bar mounted once in
 * {@link ResponsiveLayout}, above the page's `<main>`.
 *
 * Zone contract (left → right) — facts drive chrome; empty middle is OK when
 * the station/workbench band below already owns surface context:
 *   - **Nav** — toggle · Pins · Recents · page identity (one
 *     {@link HEADER_ICON_CLUSTER}). Page face is the only worded slot.
 *     Modeful pages open a child menu; Receiving benches compose peers via
 *     {@link stationSubgroupMembers}. Data = {@link SIDEBAR_PAGE_NAV} (+
 *     {@link APP_SIDEBAR_NAV} fallback) / `useQuickAccess` — never a sidebar
 *     pill twin or avatar pin list. **Never** goal / inbox / search / assistant
 *     here.
 *   - **Scan** — {@link GlobalScanDock}: the persistent station scan input.
 *     Renders only when a surface published a policy (`useScanDock`). It is a
 *     zone of its own and NOT part of `panelContent` on purpose: `panelContent`
 *     is republished by each page, which is exactly the per-route churn the
 *     dock exists to escape.
 *   - **Context** — page `panelContent` via {@link useHeader}
 *   - **Actions** — {@link GlobalHeaderActions}: search · pace-and-next
 *     ({@link HeaderGoalChip}) · inbox · assistant (far-right)
 *
 * This bar shares the desktop top-chrome seam with the MasterNav spine band
 * ({@link TOP_CHROME_BAND_CLASS}) — one flat `border-b` hairline at one Y.
 * `<main>` ({@link appContentShellClass}) is square-cornered and border-less;
 * do NOT re-add a border there, or the join doubles up.
 *
 * Mobile keeps its own chrome (MobileAppHeader); this bar is desktop-only.
 */
interface GlobalHeaderProps {
  /** True on routes that render the permanent desktop sidebar (everything but
   *  /operations) — gates the collapse toggle. */
  canCollapseSidebar?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function GlobalHeader({
  canCollapseSidebar = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}: GlobalHeaderProps = {}) {
  const { panelContent } = useHeader();
  const { user } = useAuth();
  const pathname = usePathname();

  // Public / auth pages (signin, enroll, offline) render no app chrome — even
  // mid-sign-in, when refreshAuth() has already committed `user` but the hard
  // navigation off /signin hasn't unloaded the page yet. Without the path check
  // the bar flashes in over the sign-in splash during that window.
  if (!user || isClientPublicPath(pathname)) return null;

  return (
    // Shared top-chrome seam with MasterNav spine (see TOP_CHROME_BAND_CLASS).
    <header
      className={cn(
        TOP_CHROME_BAND_CLASS,
        'sticky top-0 z-header w-full select-none gap-3 backdrop-blur-sm',
        HEADER_INSET_X,
        appChromeMutedClass,
      )}
    >
      {/* Nav — toggle · Pins · Recents · page. */}
      <div className={HEADER_ICON_CLUSTER} data-header-zone="nav">
        {canCollapseSidebar && onToggleSidebar ? (
          <SidebarCollapseControl
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={onToggleSidebar}
          />
        ) : null}
        {/* Home · Media live in the open spine band (`SpineTopPins`). Search
            is GlobalHeaderSearch. The toggle is click-only — no collapsed hover peek. */}
        <HeaderPinsSwitcher />
        <HeaderRecentsSwitcher />
        <HeaderPageSwitcher />
      </div>

      <GlobalScanDock />

      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>

      {/* Beam-height so expanded find + icon washes lock flush top/bottom. */}
      <div className="flex h-full shrink-0 items-stretch">
        <GlobalHeaderActions />
      </div>
    </header>
  );
}
