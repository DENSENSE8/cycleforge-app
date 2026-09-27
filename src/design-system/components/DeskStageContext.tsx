'use client';

/**
 * Desk stage state, published DOWN to the desk body.
 * field (operator ruling 2026-08-30).
 *
 * ONE state, three views (owner 2026-09-26): `in-place` and `split` are where
 * the record goes (remembered per staffer per desk); `floor` is the industrial
 * full canvas a list face may offer (⌘/Ctrl+Shift+F), a session posture that
 * is never remembered. `fullscreen` is derived — any view but `in-place`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type DeskStageView = 'in-place' | 'split' | 'floor';

/** The two views a staffer remembers; floor is never one of them. */
export type DeskRememberedView = Exclude<DeskStageView, 'floor'>;

interface DeskStageValue {
  view: DeskStageView;
  /** `in-place` / `split` choose (and leave floor); `floor` enters floor. */
  setView: (view: DeskStageView) => void;
  /** Enter floor, or leave it for the view it was entered from. */
  toggleFloor: () => void;
  /** A list on this stage paints a floor face — the Floor control and ⌘/Ctrl+Shift+F exist only then. */
  floorAvailable: boolean;
  /** Called by {@link useDeskFloorFace}; returns the unregister. */
  registerFloorFace: () => () => void;
  /** Derived: `view !== 'in-place'` (the page header and tab row are not rendered). */
  fullscreen: boolean;
}

const DeskStageContext = createContext<DeskStageValue | null>(null);

export function DeskStageProvider({
  view,
  setView,
  toggleFloor,
  floorAvailable,
  registerFloorFace,
  children,
}: Omit<DeskStageValue, 'fullscreen'> & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      view,
      setView,
      toggleFloor,
      floorAvailable,
      registerFloorFace,
      fullscreen: view !== 'in-place',
    }),
    [view, setView, toggleFloor, floorAvailable, registerFloorFace],
  );
  return <DeskStageContext.Provider value={value}>{children}</DeskStageContext.Provider>;
}

/** `null` when this table is not inside a desk stage. */
export function useDeskStageOptional(): DeskStageValue | null {
  return useContext(DeskStageContext);
}

/**
 * A list that can paint the floor face says so while mounted — the stage only
 * offers floor (button, shortcut) when some list can honour it.
 */
export function useDeskFloorFace(enabled: boolean): void {
  const register = useDeskStageOptional()?.registerFloorFace;
  useEffect(() => {
    if (!enabled || !register) return undefined;
    return register();
  }, [enabled, register]);
}

/** The ⌘/Ctrl+Shift+F chord — never bare `F` (scanner, find) nor ⌘F (browser find). */
export function isDeskFloorChord(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return false;
  return event.code === 'KeyF' || event.key.toLowerCase() === 'f';
}

/** Cheat-sheet row and tooltip text — one spelling of the chord. */
export const DESK_FLOOR_SHORTCUT = { keys: ['⌘/Ctrl', '⇧', 'F'], label: 'Floor view on / off' } as const;
export const DESK_FLOOR_SHORTCUT_HINT = '⌘/Ctrl+Shift+F';

// ── Floor, published ACROSS the tree ───────────────────────────────────────
// The app shell's sidebar column and the route's mode region sit above the
// desk stage, so they cannot read its context. The chrome publishes here.

let floorActive = false;
const floorListeners = new Set<() => void>();

export function publishDeskFloorActive(next: boolean): void {
  if (floorActive === next) return;
  floorActive = next;
  for (const listener of floorListeners) listener();
}

function subscribeDeskFloor(listener: () => void): () => void {
  floorListeners.add(listener);
  return () => floorListeners.delete(listener);
}

const readDeskFloor = () => floorActive;
const readServerDeskFloor = () => false;

/** Is a desk on screen in floor view? For chrome that lives above the stage. */
export function useDeskFloorActive(): boolean {
  return useSyncExternalStore(subscribeDeskFloor, readDeskFloor, readServerDeskFloor);
}
