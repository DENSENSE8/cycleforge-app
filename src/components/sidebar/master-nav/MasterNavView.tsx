'use client';

import type { SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { SidebarNavList } from './SidebarNavList';

/**
 * The **sidebar spine** — one flat page map in a resident push column.
 *
 * ## One grammar
 *
 * The page list lives in the nav spine and nowhere else. The spine is a
 * resident push column (`SidebarNavColumn`) — opening it moves the frame
 * right rather than covering it.
 *
 * ## Stack (top → bottom)
 *
 * Home · Media Library as ordinary L1 rows, then the domain map + Scan
 * Stations drill → footer Settings/Admin → staff account footer. Page jump /
 * record find is ⌘K (header Find), not an in-spine field. Search / Plans /
 * Chat stay in the registry (`spineBand: false`) without map rows.
 *
 * Global search + AI stay in GlobalHeader (`GlobalHeaderSearch`). L2 Mode +
 * Recents + Quick Access pins/actions stay in GlobalHeader.
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
  );
}
