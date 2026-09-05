'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import {
  canRideCursor,
  clearCursorLabel,
  isCursorLabelHostLive,
  publishCursorLabel,
} from './cursor-label';

/**
 * Trigger-side half of the cursor label channel.
 *
 * `enter(label, delayMs)` returns `true` when the label was handed to the
 * cursor — the caller then skips its anchored bubble. It returns `false` (and
 * publishes nothing) when the layer is not live or the label cannot ride, so
 * the caller falls back to the bubble. `leave()` clears only this trigger's
 * label, so a nested trigger's leave never wipes its parent's text.
 *
 * Clears on unmount and whenever `disabled` flips on, mirroring the bubble's
 * teardown so a hover peek that takes the face never leaves a stale chip.
 */
export function useCursorLabel({ disabled }: { disabled: boolean }) {
  const owner = useId();
  const timerRef = useRef<number | null>(null);
  /** True while this trigger's label is on (or scheduled for) the cursor. */
  const ridingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const leave = useCallback(() => {
    clearTimer();
    ridingRef.current = false;
    clearCursorLabel(owner);
  }, [clearTimer, owner]);

  const enter = useCallback(
    (label: unknown, delayMs: number): boolean => {
      if (disabled || !isCursorLabelHostLive() || !canRideCursor(label)) return false;
      clearTimer();
      ridingRef.current = true;
      if (delayMs <= 0) {
        publishCursorLabel(owner, label);
        return true;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        publishCursorLabel(owner, label);
      }, delayMs);
      return true;
    },
    [clearTimer, disabled, owner],
  );

  useEffect(() => {
    if (disabled) leave();
  }, [disabled, leave]);

  useEffect(() => () => leave(), [leave]);

  /**
   * A mouse click focuses the button it hovers. While the label rides the
   * cursor, that focus must not ALSO open the anchored bubble — two copies of
   * one label. Keyboard focus with no hover still gets the bubble.
   */
  const riding = useCallback(() => ridingRef.current, []);

  return { enter, leave, riding };
}
