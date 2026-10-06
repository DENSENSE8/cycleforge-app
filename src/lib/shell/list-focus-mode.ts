'use client';

/**
 * List FOCUS MODE — the one shell flag that turns a list surface full screen.
 *
 * Client state, never the URL (operator 2026-10-05: the `?full=1` param made
 * full screen bounce — every other URL writer on the page replaced the query
 * from its own snapshot and dropped or restored the flag). One module store,
 * mirrored to sessionStorage so a reload of the same page keeps it, and keyed
 * by pathname: it is on only on the page that turned it on, so opening a
 * record on another desk brings the chrome back and returning restores it.
 * While on, the desktop shell slides its chrome away — the sidebar column and
 * the global header (`DesktopRouteShell`) and the desk title band
 * (`DeskPageChrome`). The ONE button is `ListFocusToggle`; Esc leaves
 * (`useListFocusEscape`, mounted once by the shell).
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

const STORAGE_KEY = 'cf:list-focus-mode';

/** The pathname full screen was turned on for, or null. */
let focusedPath: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function readFocusedPath(): string | null {
  if (!hydrated && typeof window !== 'undefined') {
    hydrated = true;
    try {
      focusedPath = window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      focusedPath = null;
    }
  }
  return focusedPath;
}

function writeFocusedPath(next: string | null): void {
  readFocusedPath();
  if (next === focusedPath) return;
  focusedPath = next;
  try {
    if (next) window.sessionStorage.setItem(STORAGE_KEY, next);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the flag still holds for this tab session in memory.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface ListFocusMode {
  /** Full screen is on for the page on screen. */
  on: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

/** Read and write the focus-mode flag for the current page. */
export function useListFocusMode(): ListFocusMode {
  const pathname = usePathname() ?? '';
  // Server render and hydration read "off", so the first paint never mismatches.
  const focused = useSyncExternalStore(subscribe, readFocusedPath, () => null);
  const on = focused != null && focused === pathname;
  const set = useCallback((next: boolean) => writeFocusedPath(next ? pathname : null), [pathname]);
  return useMemo(
    () => ({ on, enter: () => set(true), exit: () => set(false), toggle: () => set(!on) }),
    [on, set],
  );
}

/**
 * Esc leaves focus mode — LAST, after every inner layer: an open overlay /
 * popover (`hasOpenOverlay`), an open record, a cell range, a check-set or a
 * split stage each claim Esc first and `preventDefault` it. The shell's
 * listener registers before any page's, so the verdict waits until the
 * keystroke has finished dispatching, then reads `defaultPrevented`. A text
 * field owns its own Esc. Lists the key in the `?` sheet while on.
 */
export function useListFocusEscape(focus: ListFocusMode): void {
  const exitRef = useRef(focus.exit);
  exitRef.current = focus.exit;
  useEffect(() => {
    if (!focus.on) return undefined;
    let pending: number | undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        if (!event.defaultPrevented) exitRef.current();
      }, 0);
    };
    window.addEventListener('keydown', onKeyDown);
    const unregister = registerShortcutOverviewGroup({
      id: 'list-focus-mode',
      title: 'Full screen',
      rows: [{ keys: ['Esc'], label: 'Exit full screen' }],
    });
    return () => {
      window.clearTimeout(pending);
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, [focus.on]);
}
