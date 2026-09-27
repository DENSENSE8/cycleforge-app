'use client';

/**
 * Left nav column open / close keys (owner 2026-09-27):
 *   - `\` or `/` alone — when not typing in a field;
 *   - ⌘ / Ctrl + `\` or `/` — anywhere, text fields included.
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
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

/** Physical keys, so the binding holds on layouts where the glyphs move. */
const TOGGLE_CODES: ReadonlySet<string> = new Set(['Backslash', 'Slash']);

function isAppleModPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || /Mac OS|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Tooltip sentence tail naming the bare keys: `\ or /`. */
export const SIDEBAR_TOGGLE_BARE_KEYS = '\\ or /';

/** Tooltip chord (`HoverTooltip shortcut`, split on `+` into keycaps): `⌘+\` or `Ctrl+\`. */
export function sidebarToggleHotkeyLabel(): string {
  return `${isAppleModPlatform() ? '⌘' : 'Ctrl'}+\\`;
}

/** `aria-keyshortcuts` value for the toggle control. */
export const SIDEBAR_TOGGLE_ARIA_KEYSHORTCUTS =
  'Backslash Slash Meta+Backslash Control+Backslash Meta+Slash Control+Slash';

/** Which binding this event is, if any. */
function sidebarToggleKind(e: KeyboardEvent): 'bare' | 'mod' | null {
  if (!TOGGLE_CODES.has(e.code) || e.shiftKey || e.altKey) return null;
  if (e.metaKey || e.ctrlKey) return 'mod';
  return 'bare';
}

export function useSidebarToggleHotkey(onToggle: () => void, enabled = true): void {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.isComposing || hasOpenOverlay()) return;
      const kind = sidebarToggleKind(e);
      if (!kind) return;
      // Bare `\` / `/` type characters — never steal them from a field.
      if (kind === 'bare' && isEditableKeyTarget(e.target)) return;
      e.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
