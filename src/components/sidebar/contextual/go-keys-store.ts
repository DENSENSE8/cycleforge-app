'use client';

import { useSyncExternalStore } from 'react';

/** One `G` then letter destination (`NAV_GO_KEYS`, the current lane's), resolved for this staffer. */
export type GoTarget = { letter: string; id: string; label: string; href: string; current: boolean };

/**
 * What the keyboard is doing right now, for every surface that teaches it.
 * `NavGoKeys` owns the `G` sequence and publishes here; the desk header's
 * key strip (`NavKeyStrip`) and the sidebar switchers' hover hints read it.
 *
 * - `pressed`: the key that just fired (`go:s`, `view:triage`), held for one
 *   press-in beat so the eye sees which cap went down;
 * - `strips`: mounted header strips — while one is up it is where `G` is taught;
 * - `peek`: the header title was hovered — its views stay unfolded until Esc,
 *   a press outside, or a pill chosen.
 */
type GoKeysSnapshot = {
  targets: readonly GoTarget[];
  armed: boolean;
  pressed: string | null;
  strips: number;
  peek: boolean;
};

const PRESS_BEAT_MS = 220;

let snapshot: GoKeysSnapshot = { targets: [], armed: false, pressed: null, strips: 0, peek: false };
const SERVER_SNAPSHOT = snapshot;
const listeners = new Set<() => void>();
let pressTimer: number | undefined;

function publish(patch: Partial<GoKeysSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGoKeys(): GoKeysSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
}

export function publishGoTargets(targets: readonly GoTarget[]) {
  publish({ targets });
}

export function publishGoArmed(armed: boolean) {
  if (snapshot.armed !== armed) publish({ armed });
}

/** A key fired: its cap presses in for one beat. */
export function publishKeyPressed(id: string) {
  window.clearTimeout(pressTimer);
  publish({ pressed: id });
  pressTimer = window.setTimeout(() => {
    pressTimer = undefined;
    publish({ pressed: null });
  }, PRESS_BEAT_MS);
}

/** A header strip is on screen; returns its unmount. */
export function registerKeyStrip(): () => void {
  publish({ strips: snapshot.strips + 1 });
  return () => publish({ strips: snapshot.strips - 1 });
}

/** The header title was hovered: unfold its views. They STICK — hovering off never folds them. */
export function openViewsPeek() {
  if (!snapshot.peek) publish({ peek: true });
}

/** Fold the views: Esc, a press outside the title and pills, or a pill chosen. */
export function closeViewsPeek() {
  if (snapshot.peek) publish({ peek: false });
}
