'use client';

/**
 * Spine top band — toggle + labelled Search.
 * Toggle is SidebarCollapseControl (same box as the closed header).
 */

import { useEffect, useState } from 'react';
import { Search } from '@/components/Icons';
import { COMMAND_BAR_OPEN_EVENT, MASTER_NAV_TOGGLE_EVENT } from '@/lib/app-events';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { SPINE_ACCENT } from '@/lib/nav/spine-section-accent';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SidebarCollapseControl } from '@/components/layout/SidebarCollapseControl';
import {
  TOP_CHROME_BAND_CLASS,
} from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

const SEARCH_ROW_CLASS = cn(
  SPINE_ROW_SHELL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ACCENT.idlePage,
  focusRing('control', 'accent'),
);

export function SpineNavChrome() {
  const [apple, setApple] = useState(true);
  useEffect(() => {
    setApple(
      typeof navigator === 'undefined'
        ? true
        : /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    );
  }, []);

  return (
    <div
      data-spine-head-chrome
      className={cn(TOP_CHROME_BAND_CLASS, 'pr-2')}
    >
      <SidebarCollapseControl
        navOpen
        onToggleNav={() => window.dispatchEvent(new Event(MASTER_NAV_TOGGLE_EVENT))}
      />
      <button
        type="button"
        data-spine-search
        onClick={() => window.dispatchEvent(new Event(COMMAND_BAR_OPEN_EVENT))}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(SEARCH_ROW_CLASS, 'min-w-0 flex-1')}
      >
        <Search className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span className="min-w-0 flex-1 truncate text-left">Search</span>
        <kbd aria-hidden className="shrink-0 rounded px-1 font-mono text-role-micro text-text-faint">
          {apple ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </button>
    </div>
  );
}
