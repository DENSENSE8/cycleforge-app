'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import {
  canRideCursor,
  clearCursorLabel,
  isCursorLabelHostLive,
  publishCursorLabel,
} from './cursor-label';

/** Trigger-side half of the cursor label channel. */
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
    (label: unknown, delayMs: number, keys?: string): boolean => {
      if (disabled || !isCursorLabelHostLive() || !canRideCursor(label)) return false;
      clearTimer();
      ridingRef.current = true;
      if (delayMs <= 0) {
        publishCursorLabel(owner, label, keys);
        return true;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        publishCursorLabel(owner, label, keys);
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
