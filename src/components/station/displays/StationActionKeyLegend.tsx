'use client';

/** Station Action Plane — leaf key bindings for Displays. */

import { useEffect, useRef } from 'react';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

export type StationActionKeyBinding = {
  /** Operator-facing chord, e.g. `F2` or `⌘S`. */
  chord: string;
  label: string;
  /** KeyboardEvent.code when matching (e.g. `F2`, `KeyS`). */
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  disabled?: boolean;
  onAction: () => void;
};

function matchBinding(e: KeyboardEvent, b: StationActionKeyBinding): boolean {
  if (b.disabled) return false;
  if (e.code !== b.code) return false;
  if (Boolean(b.metaKey) !== e.metaKey) return false;
  if (Boolean(b.ctrlKey) !== e.ctrlKey) return false;
  if (Boolean(b.shiftKey) !== e.shiftKey) return false;
  // Allow Alt only when not required (we never require Alt).
  if (e.altKey) return false;
  return true;
}

/**
 * Wire leaf keybindings. Capture-phase; skips editables and when disabled.
 * Does not handle Escape (Displays stack owns Esc).
 */
export function useStationActionKeyBindings(
  bindings: StationActionKeyBinding[],
  enabled = true,
): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Textareas block most chords — but F-keys (Refresh) and ⌘/Ctrl+S (Save)
      // must still work inside Inventory PO notes / line description fields.
      if (isEditableKeyTarget(e.target)) {
        const isFunctionKey = /^F\d{1,2}$/.test(e.code);
        const isSaveChord =
          e.code === 'KeyS' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
        if (!isFunctionKey && !isSaveChord) return;
      }
      for (const b of bindingsRef.current) {
        if (!matchBinding(e, b)) continue;
        e.preventDefault();
        e.stopPropagation();
        try {
          b.onAction();
        } catch {
          /* leaf handler errors must not break the listener */
        }
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
