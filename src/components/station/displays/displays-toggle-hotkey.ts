/**
 * Station Displays open/close chord — ⌘/Ctrl+] on {@link StationDisplaysEdgeToggle}.
 *
 * One owner, one label: the edge toggle's click handler IS the hotkey action
 * (`←|` open / `→|` close). Desk History / To-ship inspectors keep ⌘\ + bare `]`
 * — never cross-wire those chords here (Displays ≠ inspector).
 *
 * Modifier chord (⌘K rule): fires from text fields; stands down only for an
 * open overlay (`hasOpenOverlay`). Browser Forward (⌘]) is intentionally
 * stolen on station benches via preventDefault.
 */

'use client';

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

/** `KeyboardEvent.code` for the Displays toggle chord. */
const STATION_DISPLAYS_TOGGLE_CHORD_CODE = 'BracketRight' as const;

/** True when the UI should show ⌘ rather than Ctrl+. */
function isAppleModPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  return (
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
    /Mac OS|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

/** Operator-facing chord face — compose into tooltips / aria; never hand-type. */
export function stationDisplaysToggleHotkeyLabel(): string {
  const mod = isAppleModPlatform() ? '⌘' : 'Ctrl+';
  return `${mod}]`;
}

/**
 * True when this event is the Station Displays toggle chord
 * (meta|ctrl + ] , no shift/alt).
 */
function matchesStationDisplaysToggleHotkey(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
  return e.code === STATION_DISPLAYS_TOGGLE_CHORD_CODE;
}

/**
 * Bind ⌘/Ctrl+] to the same action as the mounted edge toggle's `onClick`.
 * Mount only from {@link StationDisplaysEdgeToggle} — one exclusive host at a
 * time owns the chord (pane-open or column-close).
 */
export function useStationDisplaysToggleHotkey(onToggle: () => void): void {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!matchesStationDisplaysToggleHotkey(e)) return;
      // Innermost overlay owns the keyboard — never yank Displays under a menu.
      if (hasOpenOverlay()) return;
      e.preventDefault();
      e.stopPropagation();
      onToggleRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
