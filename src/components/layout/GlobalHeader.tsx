'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeaderActions } from './GlobalHeaderActions';
import { HeaderGoalChip } from './HeaderGoalChip';
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
 *   - **Toggle** — sidebar collapse (route-gated)
 *   - **Recents / Page** — MRU then current page identity ({@link HeaderRecentsSwitcher}
 *     → {@link HeaderPageSwitcher} icon + display name). Modeful pages open a
 *     child-page menu; Receiving benches compose peers via
 *     {@link stationSubgroupMembers} (same SoT as MasterNav — not legacy
 *     `receiving` children); other modeless pages keep the same face as a
 *     static chip. Data = {@link SIDEBAR_PAGE_NAV} (+ {@link APP_SIDEBAR_NAV}
 *     fallback) via `useSidebarChildNav` — never a sidebar pill twin.
 *   - **Pins** — {@link HeaderPinsSwitcher} (directly beside Page → Pin menu;
 *     vertical DnD rows; order = ⌘/Ctrl+1–9); menu chrome shared with Page /
 *     Recents via {@link HeaderChromeMenu}. Data = `useQuickAccess` /
 *     `cf.quickAccess` — never a pin list in the avatar menu.
 *   - **Pace and next** — {@link HeaderGoalChip}: one button for "how is today
 *     going" (the ring) and "what is next" (the work-order row inside its
 *     panel). The one remaining non-nav occupant of this cluster;
 *     source-of-truth.md says goal / work order / inbox / search / assistant
 *     belong elsewhere. The work order rode the Inbox popover between
 *     2026-08-08 and this change; it is still **not** a header slot of its own,
 *     and the ring did not absorb it — a queue item has no denominator.
 *   - **Context** — page `panelContent` via {@link useHeader}
 *   - **Find / signal / AI** — {@link GlobalHeaderActions} (search, inbox,
 *     utilities, Sparkles assistant far-right)
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
      {/* Left cluster: beam-height square cells, shared gap + glyph stroke. */}
      <div className={HEADER_ICON_CLUSTER} data-header-zone="nav">
        {canCollapseSidebar && onToggleSidebar ? (
          <SidebarCollapseControl
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={onToggleSidebar}
          />
        ) : null}
        {/* Home · Search · Media · Plans · Chat live in the spine band when open
            (`SpineTopPins`). When collapsed, `SidebarCollapseControl` peeks the
            same `TopDestinationPins` on hover/focus — never a permanent second
            door in this cluster while the spine is open. */}
        <HeaderRecentsSwitcher />
        <HeaderPageSwitcher />
        <HeaderPinsSwitcher />
        {/* Pace AND next, in one button. `HeaderTopWorkOrderChip` was deleted
            from this cluster 2026-08-08 (a queue depth of one does not earn a
            permanent slot — source-of-truth.md → Per-staff queue depths); its
            row now opens inside this button's panel, so the slot count is
            unchanged and no queue depth sits on the chrome. HeaderGoalChip
            remains the one non-nav occupant of a cluster that rule says is
            toggle · Pins · Recents · page only. */}
        <HeaderGoalChip />
      </div>

      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>

      {/* Beam-height so expanded find + icon washes lock flush top/bottom. */}
      <div className="flex h-full shrink-0 items-stretch">
        <GlobalHeaderActions />
      </div>
    </header>
  );
}
