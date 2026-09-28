'use client';

/**
 * Left nav column open / close: ⌘ / Ctrl + `\` or `/`, anywhere (text fields
 * included), or the header button. No bare key (owner 2026-09-27: bare `/`
 * and `\` toggled the column by accident; `/` is typed in Find and notes).
 * Distinct from ⌘/Ctrl+B, which parks the route's context rail
 * (`context-panel-toggle-hotkey.ts`) and is the browser's bookmarks bar on
 * Windows / Linux. A page that owns one of these first keeps it: the AI
 * session binds ⌘/ in capture (focus composer), so a handled event is skipped.
 *
 * Bound once, by the shell that owns the column (`DesktopRouteShell`). The
 * faces are shown on the toggle's tooltip — compose them from here.
 */

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

/** Physical keys, so the binding holds on layouts where the glyphs move. */
const TOGGLE_CODES: ReadonlySet<string> = new Set(['Backslash', 'Slash']);

function isAppleModPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || /Mac OS|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Tooltip chord (`HoverTooltip shortcut`; `+` splits keycaps, ` or ` splits alternatives): `⌘+\ or ⌘+/`. */
export function sidebarToggleHotkeyLabel(): string {
  const mod = isAppleModPlatform() ? '⌘' : 'Ctrl';
  return `${mod}+\\ or ${mod}+/`;
}

/** `aria-keyshortcuts` value for the toggle control. */
export const SIDEBAR_TOGGLE_ARIA_KEYSHORTCUTS = 'Meta+Backslash Control+Backslash Meta+Slash Control+Slash';

/** ⌘ / Ctrl + `\` or `/`, no Shift / Alt (⌘⇧/ is the cheat sheet). */
function isSidebarToggleChord(e: KeyboardEvent): boolean {
  return TOGGLE_CODES.has(e.code) && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
}

export function useSidebarToggleHotkey(onToggle: () => void, enabled = true): void {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.isComposing || hasOpenOverlay()) return;
      if (!isSidebarToggleChord(e)) return;
      e.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
