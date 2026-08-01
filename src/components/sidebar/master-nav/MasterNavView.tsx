'use client';

import { TOP_CHROME_BAND_FACE } from '@/components/layout/header-shell';
import type { SidebarPageNav, SpineSectionId } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { MasterNavHeader } from './MasterNavHeader';
import { SidebarNavList } from './SidebarNavList';

/**
 * The **sidebar spine** — a 40px identity band over one swapping body.
 *
 * ## One grammar
 *
 * The page list lives in the nav spine and nowhere else. The spine is a
 * resident push column (`SidebarNavColumn`) — opening it moves the frame
 * right rather than covering it.
 *
 * ## Stack (top → bottom)
 *
 * 1. **Name-of-now** — identity only (label + leading icon: mode glyph or page icon).
 * 2. **Body** — Home/Search/Media top pin → section drills (Overview / Scan
 *    Stations / Desk / Stock / Library) or the root map of those section
 *    buttons → Settings/Admin footer pin.
 *
 * Global search + AI stay in GlobalHeader (`GlobalHeaderSearch`). L2 Mode +
 * Recents stay in GlobalHeader. Home + Search + Media page rows are top-pinned
 * in the spine (not a GlobalHeader twin).
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
  const activeMode = activePage.modes?.find((m) => m.id === activeModeId);
  const headerLabel = activeMode?.label ?? activePage.label;
  // Modeful: active mode glyph; modeless: page icon — every destination shows a leading icon.
  const headerIcon =
    activePage.modes && activePage.modes.length > 1
      ? (activeMode ?? activePage.modes[0])?.icon
      : activePage.icon;

  return (
    <div className={cn('isolate flex h-full min-h-0 flex-col', className)}>
      {/* Same box model as GlobalHeader — height + hairline on one element. */}
      <div className={cn(TOP_CHROME_BAND_FACE, 'flex w-full min-w-0 items-stretch')}>
        <MasterNavHeader label={headerLabel} leadingIcon={headerIcon} />
      </div>

      {/* One body: top pin + section drills + pinned Settings/Admin. */}
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
