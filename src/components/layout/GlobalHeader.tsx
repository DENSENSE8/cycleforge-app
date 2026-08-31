'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeaderActions } from './GlobalHeaderActions';
import { GlobalScanDock } from './GlobalScanDock';
import { HeaderPageSwitcher } from './HeaderPageSwitcher';
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
 *   - **Nav** — toggle · Pins · Recents · page chip in one
 *     {@link HEADER_ICON_CLUSTER} (`gap-0` — Recents abuts the page face).
 *     Page identity is a compact {@link HEADER_PAGE_FACE_WIDTH} chip matching
 *     its child menu. Modeful pages open a child menu; Scan Stations benches
 *     compose peers via {@link floorStationPages}. Data =
 *     {@link SIDEBAR_PAGE_NAV} (+ {@link APP_SIDEBAR_NAV} fallback) /
 *     `useQuickAccess`. Find is **not** here.
 *   - **Find** — {@link GlobalHeaderSearch} / {@link CommandBar} on the
 *     right rail (⌘K). Icon opens a records popover.
 *   - **Scan** — {@link GlobalScanDock}: the persistent station scan input.
 *     Renders only when a surface published a policy (`useScanDock`). It is a
 *     zone of its own and NOT part of `panelContent` on purpose: `panelContent`
 *     is republished by each page, which is exactly the per-route churn the
 *     dock exists to escape.
 *   - **Context** — page `panelContent` via {@link useHeader}
 *   - **Actions** — {@link GlobalHeaderActions}: pace-and-next
 *     ({@link HeaderGoalChip}) · inbox · assistant (far-right)
 *
 * This bar shares the desktop top-chrome face with the MasterNav spine band
 * ({@link TOP_CHROME_BAND_CLASS}) — one 40px height, no bottom hairline.
 * `<main>` ({@link appContentShellClass}) is square-cornered and border-less;
 * do NOT re-add a stroke under this bar, or it splits the raised canvas.
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
      {/* Toggle · Pins · Recents · page chip — one gap-0 cluster. */}
      <div className={HEADER_ICON_CLUSTER} data-header-zone="nav">
        {canCollapseSidebar && onToggleSidebar ? (
          <SidebarCollapseControl
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={onToggleSidebar}
          />
        ) : null}
        {/*
          The PIN switcher was here and is gone (operator ruling 2026-08-29).
          Quick-access pins duplicated navigation the spine already carries, and
          the control sat in the top-left corner an operator scans for "where am
          I" — answering "where could I go" instead. Recents and the page
          switcher remain: those answer where you WERE and where you ARE.

          The pin DATA (`cf.quickAccess`, ⌘/Ctrl+1–9) is untouched — this
          removes the header door, not the feature.
        */}
        <HeaderRecentsSwitcher />
        <HeaderPageSwitcher />
      </div>

      <GlobalScanDock />

      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>

      {/* Beam-height so icon washes lock flush top/bottom. */}
      <div className="flex h-full shrink-0 items-stretch">
        <GlobalHeaderActions />
      </div>
    </header>
  );
}
