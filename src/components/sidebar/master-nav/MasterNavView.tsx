'use client';

import { TOP_CHROME_BAND_FACE } from '@/components/layout/header-shell';
import type { SidebarPageNav, SpineSectionId } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { OrgWorkspaceControl } from './OrgWorkspaceControl';
import { SidebarNavList } from './SidebarNavList';

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
 * 1. **Org / workspace** — current tenant (+ switch when multi-org).
 * 2. **Body** — Home/Search/Media/Chat top pin → section drills → footer
 *    {@link TechRailSearchBar} → Settings/Admin pin → staff account footer.
 *
 * Global search + AI stay in GlobalHeader (`GlobalHeaderSearch`). L2 Mode +
 * Recents + Quick Access pins/actions stay in GlobalHeader. Page selection is
 * the selected body row — not a twin label in the top band.
 */
export function MasterNavView({
  activePage,
  activeModeId,
  otherPages,
  onNavigate,
  onRowHover,
  drillId,
  onDrillChange,
  className,
}: {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per page row — warms the destination's data. */
  onRowHover?: (page: SidebarPageNav) => void;
  drillId: SpineSectionId | null;
  onDrillChange: (id: SpineSectionId | null) => void;
  className?: string;
}) {
  return (
    <div className={cn('isolate flex h-full min-h-0 flex-col', className)}>
      {/* Same box model as GlobalHeader — height + hairline on one element. */}
      <div className={cn(TOP_CHROME_BAND_FACE, 'flex w-full min-w-0 items-stretch')}>
        <OrgWorkspaceControl />
      </div>

      {/* One body: top pin + section drills + pinned Settings/Admin + staff. */}
      <div className="min-h-0 flex-1">
        <SidebarNavList
          activePage={activePage}
          activeModeId={activeModeId}
          otherPages={otherPages}
          onNavigate={onNavigate}
          onRowHover={onRowHover}
          drillId={drillId}
          onDrillChange={onDrillChange}
        />
      </div>
    </div>
  );
}
