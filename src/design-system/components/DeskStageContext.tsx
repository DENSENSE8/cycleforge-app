'use client';

/**
 * Desk stage state, published DOWN to the desk body.
 * field (operator ruling 2026-08-30).
 *
 * ONE state, two views (owner 2026-09-28: the desktop is triage-only, no
 * Floor): `in-place` and `split` are where the record goes, remembered per
 * staffer per desk. `fullscreen` is derived — `split`.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type DeskStageView = 'in-place' | 'split';

interface DeskStageValue {
  view: DeskStageView;
  setView: (view: DeskStageView) => void;
  /** Derived: `view !== 'in-place'` (the page header and tab row are not rendered). */
  fullscreen: boolean;
}

const DeskStageContext = createContext<DeskStageValue | null>(null);

export function DeskStageProvider({
  view,
  setView,
  children,
}: Omit<DeskStageValue, 'fullscreen'> & { children: ReactNode }) {
  const value = useMemo(() => ({ view, setView, fullscreen: view !== 'in-place' }), [view, setView]);
  return <DeskStageContext.Provider value={value}>{children}</DeskStageContext.Provider>;
}

/** `null` when this table is not inside a desk stage. */
export function useDeskStageOptional(): DeskStageValue | null {
  return useContext(DeskStageContext);
}

/**
 * ⌘/Ctrl+Shift+S — In place ⇄ Split. Never a bare key (a wedge scanner can
 * type it) nor ⌘/Ctrl+S (the browser's save).
 */
export function isDeskSplitChord(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return false;
  return event.code === 'KeyS' || event.key.toLowerCase() === 's';
}

/**
 * Cheat-sheet row and tooltip chord — one spelling, platform-neutral: `mod`
 * paints ⌘ on Apple and Ctrl elsewhere (`KeyboardKey` → `platformKeyFace`).
 */
export const DESK_SPLIT_SHORTCUT = { keys: ['mod', 'Shift', 'S'], label: 'Split view on / off' } as const;
export const DESK_SPLIT_SHORTCUT_HINT = 'mod + Shift + S';
