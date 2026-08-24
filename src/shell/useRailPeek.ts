'use client';

/**
 * THE HOVER-PEEK TIMER — shared by both rails (2026-08-24, operator
 * ruling: the right rail's fully-closeable behaviour was extended to the
 * left rail for parity, one control on each side of the beam).
 *
 * A rail may be PINNED open (a header-button click — always works, hover
 * or not) or PEEKING open (a hover hot-zone, transient, never pins). Plain
 * timers gate WHEN the peek state flips; the flip itself stays
 * instantaneous, so this is a debounce of a discrete state, never the
 * geometry animation M1 bans.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Long enough that a mouse merely passing over the screen's edge never
    trips it; short enough that a deliberate pause reads as instant. */
const PEEK_OPEN_DELAY_MS = 180;
/** A short grace period so crossing from the hot-zone onto the rail's own
    content doesn't flicker the rail shut mid-crossing. */
const PEEK_CLOSE_DELAY_MS = 260;

export function useRailPeek(pinned: boolean) {
  const [peeking, setPeeking] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Pinning wins outright: once a header button has opened it, there is
  // nothing left for hover to schedule.
  const handleEnter = useCallback(() => {
    if (pinned) return;
    clearTimers();
    openTimer.current = setTimeout(() => setPeeking(true), PEEK_OPEN_DELAY_MS);
  }, [clearTimers, pinned]);

  const handleLeave = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setPeeking(false), PEEK_CLOSE_DELAY_MS);
  }, [clearTimers]);

  return { visible: pinned || peeking, handleEnter, handleLeave };
}
