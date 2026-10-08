'use client';

/**
 * A dialog form's settle (operator 2026-10-08): a host whose write empties its
 * own selection — the Live feed's bulk bar clears its checks, which unmounts
 * the strip and its dialog — waits until the done face closes (Done, Enter,
 * Esc or ×), so the operator sees the green check first. Set the returned
 * ref's `current` once the write lands; `onSettled` runs when the form unmounts
 * after it. Without `onSettled` it does nothing.
 */

import { useEffect, useRef, type MutableRefObject } from 'react';

export function useSettleOnClose(onSettled: (() => void) | undefined): MutableRefObject<boolean> {
  const landed = useRef(false);
  const settle = useRef(onSettled);
  useEffect(() => {
    settle.current = onSettled;
  });
  useEffect(
    () => () => {
      if (landed.current) settle.current?.();
    },
    [],
  );
  return landed;
}
