'use client';

/**
 * Spine top band — toggle + the one search field. The page map has no list
 * of its own, so the field is its everywhere face (`NavFind` with no page
 * scope), sitting identically to the contextual sidebar's.
 * Toggle is SidebarCollapseControl (same box as the closed header).
 */

import { MASTER_NAV_TOGGLE_EVENT } from '@/lib/app-events';
import { SidebarCollapseControl } from '@/components/layout/SidebarCollapseControl';
import { TOP_CHROME_BAND_CLASS } from '@/components/layout/header-shell';
import { NavFind } from '@/components/sidebar/contextual/NavFind';
import { cn } from '@/utils/_cn';

export function SpineNavChrome() {
  return (
    <div data-spine-head-chrome className="flex shrink-0 flex-col gap-1 pb-1">
      <div className={cn(TOP_CHROME_BAND_CLASS, 'items-center pl-1 pr-2')}>
        <SidebarCollapseControl
          navOpen
          onToggleNav={() => window.dispatchEvent(new Event(MASTER_NAV_TOGGLE_EVENT))}
        />
        <NavFind />
      </div>
    </div>
  );
}
