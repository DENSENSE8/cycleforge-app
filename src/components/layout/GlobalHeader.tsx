'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeaderActions } from './GlobalHeaderActions';
import { GlobalScanDock } from './GlobalScanDock';
import { HeaderRecentsSwitcher } from './HeaderRecentsSwitcher';
import {
  HEADER_ICON_CLUSTER,
  HEADER_INSET_X,
  TOP_CHROME_BAND_CLASS,
} from './header-shell';
import { SidebarCollapseControl } from './SidebarCollapseControl';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Global desktop header — one persistent bar mounted once in
 * {@link ResponsiveLayout}, above the page's `<main>`.
 *
 * Zone contract (left → right) — facts drive chrome; empty middle is OK when
 * the station/workbench band below already owns surface context:
 *   - **Nav** — toggle · Recents (work sessions) in one
 *     {@link HEADER_ICON_CLUSTER}. Staff pins live on MasterNav. Floor benches
 *     switch via MasterNav hover peek, not a header chip. Find is **not** here.
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
  /** Collapsed hover peek of the MasterNav spine is visible. */
  navPeeking?: boolean;
  navPeekTriggerProps?: {
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  };
}

export function GlobalHeader({
  canCollapseSidebar = false,
  sidebarCollapsed = false,
  onToggleSidebar,
  navPeeking = false,
  navPeekTriggerProps,
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
      {/* Toggle · Find (closed only) · Recents — one gap-0 cluster.

          With the spine CLOSED the search icon sits here, second from the
          left, the way every agent desktop app arranges a collapsed
          navigator: the two things you can still do without the map are open
          it and search it. With the spine OPEN, Search is the spine's own
          second row and this slot is empty — one search icon on screen at a
          time, one `COMMAND_BAR_OPEN_EVENT`, one palette. */}
      <div className={HEADER_ICON_CLUSTER} data-header-zone="nav">
        {canCollapseSidebar && onToggleSidebar ? (
          <SidebarCollapseControl
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={onToggleSidebar}
            peeking={navPeeking}
            peekTriggerProps={navPeekTriggerProps}
          />
        ) : null}
        {sidebarCollapsed ? <GlobalHeaderSearch /> : null}
        {/*
          Scan Stations peer chip is gone (operator 2026-09-01): MasterNav
          hover-peek already lists every floor bench. Recents is work sessions
          (where you WERE). Staff pins live in MasterNav, not this bar.
        */}
        <HeaderRecentsSwitcher />
      </div>

      <GlobalScanDock />

      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>

      {/* Beam-height so icon washes lock flush top/bottom. */}
      <div className="flex h-full shrink-0 items-stretch">
        <GlobalHeaderActions showFind={!sidebarCollapsed} />
      </div>
    </header>
  );
}
