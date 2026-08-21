'use client';

import type { SidebarPageNav } from '@/lib/sidebar-navigation';
import { TOP_CHROME_BAND_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';
import { SidebarNavList } from './SidebarNavList';
import { SpineTopPins } from './SpineTopPins';

/**
 * The **sidebar spine** — a 40px workspace band over one swapping body.
 *
 * ## One grammar
 *
 * The page list lives in the nav spine and nowhere else. The spine is a
 * resident push column (`SidebarNavColumn`) — opening it moves the frame
 * right rather than covering it.
 *
 * ## Stack (top → bottom)
 *
 * 1. **Top band (40px)** — {@link SpineTopPins}: Home · Media as icons
 *    when the spine is open. Shares the desktop top-chrome seam with the
 *    GlobalHeader. When closed, reach them via ⌘K / opening the map — the
 *    header toggle is click-only (no hover peek). Search / Plans / Chat stay
 *    in the registry (`spineBand: false`) without glyphs.
 * 2. **Body** — flat domain map + Scan Stations Vercel drill → footer
 *    {@link TechRailSearchBar} → Settings/Admin pin → staff account footer.
 *
 * Global search + AI stay in GlobalHeader (`GlobalHeaderSearch`). L2 Mode +
 * Recents + Quick Access pins/actions stay in GlobalHeader. Page selection is
 * the selected body row — not a twin label in the top band.
 *
 * **Face:** `font-spine` (Overpass) is local to this column. App sans /
 * condensed / mono cuts are unchanged.
 */
export function MasterNavView({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  stationsDrillOpen,
  onStationsDrillChange,
  className,
}: {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  /** Hover hook per page row — warms the destination's data. */
  onRowHover?: (page: SidebarPageNav) => void;
  /** Scan Stations list-replace drill (floor only). */
  stationsDrillOpen: boolean;
  onStationsDrillChange: (open: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('isolate flex h-full min-h-0 flex-col font-spine', className)}>
      {/* The band's HEIGHT is geometry, not content. The spine is a flex SIBLING
          of the header+content column (see ResponsiveLayout), so this primary face
          is what puts the spine's bottom hairline on the same Y as the
          GlobalHeader's — drop it and the header's border runs into the spine
          mid-row.

          What left is the org/workspace control. This is small-business
          software: an operator belongs to one org, so a permanent row naming it
          spent the spine's most valuable space restating something that never
          changes. Org IDENTITY renders in the StaffAccountFooter ⋯ menu header,
          and org SWITCHING lives in Settings → Organization
          (`WorkspaceSwitcher`), the honest home for a rare, deliberate act.

          What ARRIVED is {@link SpineTopPins} — Home · Media. The band
          was blank for a day after the org control went, and a blank 40px strip
          at the top of the navigator is worse than a used one. These pins sit
          here for free: the band's height is already reserved by the seam. */}
      <div className={cn(TOP_CHROME_BAND_FACE, 'flex w-full min-w-0 items-stretch')}>
        <SpineTopPins />
      </div>

      {/* One body: sections + pinned Settings/Admin + staff. */}
      <div className="min-h-0 flex-1">
        <SidebarNavList
          activePage={activePage}
          activeChildId={activeChildId}
          otherPages={otherPages}
          onNavigate={onNavigate}
          onRowHover={onRowHover}
          stationsDrillOpen={stationsDrillOpen}
          onStationsDrillChange={onStationsDrillChange}
        />
      </div>
    </div>
  );
}
