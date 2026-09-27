'use client';

/**
 * Spine top band — toggle + global search. The search is the SAME face the
 * contextual sidebar pins (`NavGlobalSearch`), so ⌘K / Ctrl K looks and sits
 * identically on every page, map or contextual.
 * Toggle is SidebarCollapseControl (same box as the closed header).
 */

import { MASTER_NAV_TOGGLE_EVENT } from '@/lib/app-events';
import { SidebarCollapseControl } from '@/components/layout/SidebarCollapseControl';
import { TOP_CHROME_BAND_CLASS } from '@/components/layout/header-shell';
import { NavGlobalSearch } from '@/components/sidebar/contextual/NavFind';
import { cn } from '@/utils/_cn';

export function SpineNavChrome() {
  return (
    <div data-spine-head-chrome className={cn(TOP_CHROME_BAND_CLASS, 'items-center pr-2')}>
      <SidebarCollapseControl
        navOpen
        onToggleNav={() => window.dispatchEvent(new Event(MASTER_NAV_TOGGLE_EVENT))}
      />
      <NavGlobalSearch />
    </div>
  );
}
