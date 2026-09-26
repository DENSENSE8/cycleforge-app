/** Left context-rail park/restore chord — ⌘/Ctrl+B on {@link ContextPanelLayout}. */

'use client';

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

/** `KeyboardEvent.code` for the context-rail toggle chord. */
const CONTEXT_PANEL_TOGGLE_CHORD_CODE = 'KeyB' as const;

/** True when the UI should show ⌘ rather than Ctrl+. */
function isAppleModPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  return (
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
    /Mac OS|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

/** Operator-facing chord face — compose into tooltips / aria; never hand-type. */
export function contextPanelToggleHotkeyLabel(): string {
  const mod = isAppleModPlatform() ? '⌘' : 'Ctrl+';
  return `${mod}B`;
}

function matchesContextPanelToggleHotkey(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
  return e.code === CONTEXT_PANEL_TOGGLE_CHORD_CODE;
}

/**
 * Bind ⌘/Ctrl+B to park/restore the left context rail.
 * Mount only from {@link ContextPanelLayout} (single owner).
 */
export function useContextPanelToggleHotkey(
  onToggle: () => void,
  enabled = true,
): void {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!matchesContextPanelToggleHotkey(e)) return;
      if (hasOpenOverlay()) return;
      e.preventDefault();
      e.stopPropagation();
      onToggleRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
