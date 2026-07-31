'use client';

import { useCallback, useRef } from 'react';
import { TOP_CHROME_BAND_FACE } from '@/components/layout/header-shell';
import type { SidebarPageNav, SpineDrillId } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { MasterNavHeader } from './MasterNavHeader';
import { SidebarNavList } from './SidebarNavList';

/**
 * The **sidebar spine** — a 40px identity band over one swapping body.
 *
 * ## One grammar
 *
 * There used to be three ways to reach the page list, then two. Both are gone:
 *
 * - `layout="docked"` grew the nav card in flow (`height: 0 → auto`), pushing the
 *   recents rail and the scan bar down while an operator was mid-task.
 * - The `AnchoredLayer` **flyout** (`MasterNavDropdown` at `w-[28rem]`, portaled,
 *   overhanging the work canvas) replaced it on classic routes, while station
 *   routes rendered the same rows in flow as a pushed-across column — two spatial
 *   models for one control.
 *
 * Now there is one: **the page list lives in the nav spine and nowhere else**,
 * and the spine is a resident push column (`SidebarNavColumn`) — opening it
 * moves the frame right rather than covering it. `MasterNavDropdown` is
 * deleted; {@link SidebarNavList} is the same rows with no card chrome, because
 * the column already IS the surface.
 *
 * ## One body: the page list
 *
 * This renders a 40px identity band over the page list (Main / Stations + Stock
 * drill + pinned Settings/Admin footer), and nothing else. A route's own sidebar
 * mounts in the content region beside the workspace (`ContextPanelLayout`).
 * L2 mode switching + Recents live in GlobalHeader — the band shows identity only.
 */
export function MasterNavView({
  activePage,
  activeModeId,
  onOpen,
  otherPages,
  expandedKey,
  onToggleRow,
  onNavigate,
  onRowHover,
  drillId,
  onDrillChange,
  className,
}: {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  /** Open the page-list slide-over. Only wired from the resident column's band. */
  onOpen: () => void;
  otherPages: SidebarPageNav[];
  expandedKey: string | null;
  onToggleRow: (key: string | null) => void;
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per page row — warms the destination's data. */
  onRowHover?: (page: SidebarPageNav) => void;
  drillId: SpineDrillId | null;
  onDrillChange: (id: SpineDrillId | null) => void;
  className?: string;
}) {
  const activeMode = activePage.modes?.find((m) => m.id === activeModeId);
  const headerLabel = activeMode?.label ?? activePage.label;
  // Modes own icons — show the active mode glyph beside “now”; modeless pages stay text-only.
  const headerIcon =
    activePage.modes && activePage.modes.length > 1
      ? (activeMode ?? activePage.modes[0])?.icon
      : undefined;

  const headerRef = useRef<HTMLDivElement>(null);

  const handleNavToggle = useCallback(() => {
    onOpen();
  }, [onOpen]);

  return (
    <div className={cn('isolate flex h-full min-h-0 flex-col', className)}>
      {/* Same box model as GlobalHeader — height + hairline on one element. */}
      <div
        ref={headerRef}
        className={cn(TOP_CHROME_BAND_FACE, 'flex w-full min-w-0 items-stretch')}
      >
        <MasterNavHeader
          label={headerLabel}
          leadingIcon={headerIcon}
          open={false}
          onClick={handleNavToggle}
          // The list IS this surface's body, so a trigger for it would be a
          // dead control. (The header's sidebar button is the way in.)
          showNavToggle={false}
        />
      </div>

      {/* One body: scrollable Main/Stations + Stock drill + pinned Settings/Admin. */}
      <div className="min-h-0 flex-1">
        <SidebarNavList
          activePage={activePage}
          activeModeId={activeModeId}
          otherPages={otherPages}
          expandedKey={expandedKey}
          onToggleRow={onToggleRow}
          onNavigate={onNavigate}
          onRowHover={onRowHover}
          drillId={drillId}
          onDrillChange={onDrillChange}
        />
      </div>
    </div>
  );
}
