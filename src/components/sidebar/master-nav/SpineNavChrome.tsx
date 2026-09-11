'use client';

/**
 * Spine top band — toggle + labelled Search. Same screen corner as the
 * closed-spine GlobalHeader cluster. No New chat / session title.
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
import { HEADER_ICON_CORNER } from '@/design-system/tokens/radius';
import { TOP_CHROME_BAND_CLASS } from '@/components/layout/header-shell';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

const SEARCH_ROW_CLASS = cn(
  SPINE_ROW_SHELL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ACCENT.idlePage,
  focusRing('control', 'accent'),
);

function PanelLeftGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)}
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

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
      className={cn(TOP_CHROME_BAND_CLASS, 'flex items-center gap-1 px-2')}
    >
      <IconButton
        size="sm"
        data-spine-nav-toggle
        onClick={() => window.dispatchEvent(new Event(MASTER_NAV_TOGGLE_EVENT))}
        ariaLabel="Hide navigation"
        aria-pressed
        className={cn('shrink-0', HEADER_ICON_CORNER, SPINE_ACCENT.idlePage)}
        icon={<PanelLeftGlyph />}
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
