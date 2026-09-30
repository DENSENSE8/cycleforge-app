'use client';

/**
 * Saved-view digit hotkeys — ONE hook for the held-Shift reveal + jump on the
 * contextual sidebar's saved-view presets (`SavedViewPresetList`).
 *
 * Hold Shift: every preset row paints its digit keycap (no hover needed).
 * Shift + 1–9 while held: jump to that view — same gesture as clicking the
 * row (the lit view's digit clears it). Digits are matched on `event.code`,
 * never `event.key`: with Shift down the number row emits `!@#$…` and each
 * keyboard layout a different symbol, but the physical key is stable.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';

/** Digits paint and bind on the first nine views, in list order. */
export const MAX_SAVED_VIEW_DIGIT = 9;

/** `Digit3` / `Numpad3` → 3 — the physical key, layout-blind. */
const DIGIT_CODE = /^(?:Digit|Numpad)([1-9])$/;

// ─── Held-Shift store (module-level; listeners attach while surfaces mount) ──

type Listener = () => void;

let shiftHeld = false;
let listenerCount = 0;
const listeners = new Set<Listener>();

/** Stable server snapshot — React warns if getServerSnapshot returns fresh state. */
const SERVER_SHIFT_HELD = false;

function emitShiftHeld() {
  for (const listener of listeners) listener();
}

function setShiftHeld(next: boolean) {
  if (shiftHeld === next) return;
  shiftHeld = next;
  emitShiftHeld();
}

function subscribeShiftHeld(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getShiftHeld(): boolean {
  return shiftHeld;
}

function getServerShiftHeld(): boolean {
  return SERVER_SHIFT_HELD;
}

/** True while Shift is held — paint digit identifiers wherever this returns true. */
export function useShiftHeld(): boolean {
  const held = useSyncExternalStore(subscribeShiftHeld, getShiftHeld, getServerShiftHeld);
  useEffect(() => {
    listenerCount += 1;
    if (listenerCount === 1) {
      window.addEventListener('keydown', onShiftDown, true);
      window.addEventListener('keyup', onShiftUp, true);
      window.addEventListener('blur', onWindowBlur);
    }
    return () => {
      listenerCount = Math.max(0, listenerCount - 1);
      if (listenerCount === 0) {
        window.removeEventListener('keydown', onShiftDown, true);
        window.removeEventListener('keyup', onShiftUp, true);
        window.removeEventListener('blur', onWindowBlur);
        // A late keyup with no listener would strand the held state.
        setShiftHeld(false);
      }
    };
  }, []);
  return held;
}

function onShiftDown(event: KeyboardEvent) {
  if (event.key === 'Shift') setShiftHeld(true);
}

function onShiftUp(event: KeyboardEvent) {
  if (event.key === 'Shift') setShiftHeld(false);
}

/** Alt-tab / focus loss while holding: the keyup never arrives. */
function onWindowBlur() {
  setShiftHeld(false);
}

// ─── The jump: Shift + digit applies the Nth saved view ──────────────────────

export function useSavedViewDigitHotkeys<V extends { id: string; name: string }>(model: {
  views: readonly V[];
  /** The lit view's id — its digit clears the view, like clicking the row. */
  activeViewId: string | null;
  applyView: (view: V) => void;
  clearView: () => void;
}): void {
  const modelRef = useRef(model);
  modelRef.current = model;
  // Re-bind only when the painted digits themselves change, not per render.
  const signature = model.views.map((view) => `${view.id}:${view.name}`).join('|');

  useEffect(() => {
    if (model.views.length === 0) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      // An open overlay (a record, a popover) owns the keyboard; typing
      // capitals in a field is not a jump.
      if (isEditableKeyTarget(event.target) || hasOpenOverlay()) return;
      const digit = DIGIT_CODE.exec(event.code)?.[1];
      if (!digit) return;
      const view = modelRef.current.views[Number(digit) - 1];
      if (!view) return;
      event.preventDefault();
      event.stopPropagation();
      if (view.id === modelRef.current.activeViewId) modelRef.current.clearView();
      else modelRef.current.applyView(view);
    };

    window.addEventListener('keydown', onKeyDown, true);
    // The `?` / ⌘⇧? sheet teaches the reveal and every painted digit.
    const unregister = registerShortcutOverviewGroup({
      id: 'saved-view-digits',
      title: 'Saved views — left rail',
      rows: [
        { keys: ['Shift'], label: 'Hold to show each view’s digit' },
        ...model.views.slice(0, MAX_SAVED_VIEW_DIGIT).map((view, index) => ({
          keys: ['Shift', String(index + 1)],
          label: view.name,
        })),
      ],
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      unregister();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the views' identity
  }, [signature]);
}
