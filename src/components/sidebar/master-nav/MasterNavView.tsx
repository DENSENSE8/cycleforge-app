'use client';

import { useCallback, useRef } from 'react';
import type { SidebarPageNav } from '@/lib/sidebar-navigation';
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
 * This renders a 40px identity band over the page list, and nothing else. A
 * route's own sidebar — the Media library's facet rail, Products' catalog
 * picker, the receiving rails — is NOT a body this component can render; it
 * mounts in the content region beside the workspace (`ContextPanelLayout`).
 *
 * L2 mode switching + Recents live in GlobalHeader (`HeaderModeSwitcher` /
 * `HeaderRecentsSwitcher`) — the band shows identity only (mode glyph + label).
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
      <div ref={headerRef} className="shrink-0 border-b border-border-hairline">
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

      {/* One body, always the page list. Nothing swaps, so no crossfade. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNavList
          activePage={activePage}
          activeModeId={activeModeId}
          otherPages={otherPages}
          expandedKey={expandedKey}
          onToggleRow={onToggleRow}
          onNavigate={onNavigate}
          onRowHover={onRowHover}
        />
      </div>
    </div>
  );
}
