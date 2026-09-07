'use client';

/**
 * Calm → focus: the home surface's power-up trigger.
 *
 * The greeting is the RESTING face — the operator sits down, the room is
 * quiet, one question hangs over the composer. The first real sign of life
 * (pointer travel, a key, a touch, a scroll) WAKES the surface into the
 * mission frame: the ledger assembles, the telemetry strip cuts in, the
 * composer docks bottom-left. Extended stillness with an empty thread
 * settles the room back to the question.
 *
 * ## Why a threshold, not any pixel
 *
 * A stray mouse twitch from a docked laptop or a tab regaining focus must
 * not fire the power-up. Pointer wake needs ~24px of travel; keys, wheels
 * and touches wake immediately — a person about to type has already decided
 * to work.
 *
 * ## Why it can settle back
 *
 * The calm state is not a splash screen; it is the surface's honest answer
 * to "nobody is driving right now". After IDLE_MS with no activity AND no
 * live conversation, the frame recedes and the question returns. A thread
 * with messages in it pins focus — falling asleep over a live conversation
 * would hide the operator's own words.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_MS = 4 * 60_000;
const POINTER_TRAVEL_PX = 24;

export function useFocusWake(options: { pinned: boolean }): boolean {
  const [focused, setFocused] = useState(false);
  const pinnedRef = useRef(options.pinned);
  pinnedRef.current = options.pinned;

  useEffect(() => {
    if (options.pinned && !focused) setFocused(true);
    // A pinned surface (live thread) never settles back — this effect only
    // promotes; the demotion path below refuses while pinned.
  }, [options.pinned, focused]);

  const wake = useCallback(() => {
    setFocused((cur) => (pinnedRef.current ? true : cur || true));
  }, []);

  useEffect(() => {
    let last = { x: 0, y: 0 };
    let travelled = 0;
    let idleTimer = 0;

    const armIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        // Settle back ONLY when nothing is live: an empty thread means the
        // surface belongs to the room again.
        if (!pinnedRef.current) setFocused(false);
      }, IDLE_MS);
    };

    const onPointerMove = (e: PointerEvent) => {
      travelled += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      if (travelled >= POINTER_TRAVEL_PX) {
        wake();
        armIdle();
      }
    };
    const onImmediate = () => {
      wake();
      armIdle();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onImmediate, { passive: true });
    window.addEventListener('keydown', onImmediate);
    window.addEventListener('wheel', onImmediate, { passive: true });
    window.addEventListener('touchstart', onImmediate, { passive: true });
    armIdle();
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onImmediate);
      window.removeEventListener('keydown', onImmediate);
      window.removeEventListener('wheel', onImmediate);
      window.removeEventListener('touchstart', onImmediate);
    };
  }, [wake]);

  return focused;
}
