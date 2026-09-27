'use client';

/** `useLiveValueChange` — the attention pulse & morph a collection-row VALUE runs when someone ELSE changed the fact behind it. */

import { useEffect, useRef, type RefObject } from 'react';

import { motionRole } from './roles';
import { animate, useReducedMotion } from './react';

/** Marks the chip for the duration of the pulse. */
export const LIVE_VALUE_CHANGE_ATTR = 'data-live-value-change';

/** How long the mark stays on, in ms. */
export const LIVE_VALUE_CHANGE_MARK_MS = 1400;

/** Should a value transition run the pulse? */
export function shouldPulseLiveValue(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (previous === undefined) return false;
  if (next == null) return false;
  return previous !== next;
}

interface LiveValueChangeRefs {
  /** The chip itself — carries the double-pulse scale. */
  chipRef: RefObject<HTMLSpanElement>;
  /** Absolute inset-0 ring overlay — carries the flash. Never scaled (a halo
   *  that grows past the chip gets clipped by the cell's own overflow). */
  ringRef: RefObject<HTMLSpanElement>;
  /** The label text — carries the morph dip. */
  labelRef: RefObject<HTMLSpanElement>;
}

/** Watch `value`; pulse the returned refs when it changes under a mounted chip. */
export function useLiveValueChange(value: string | null | undefined): LiveValueChangeRefs {
  const chipRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const previousRef = useRef<string | null | undefined>(undefined);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = value;
    if (!shouldPulseLiveValue(previous, value)) return;

    const chip = chipRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;
    if (!chip) return;

    const playing: { stop: () => void }[] = [];
    const { transition, morph } = motionRole.feedback.liveChange;

    // The morph runs in BOTH motion modes — a crossfade is the accepted
    // reduced form of a transition, not something to suppress outright.
    if (label) playing.push(animate(label, { opacity: [1, 0.25, 1] }, morph));

    if (!reducedMotion) {
      chip.setAttribute(LIVE_VALUE_CHANGE_ATTR, '');
      playing.push(animate(chip, { scale: [null, 1.06, 1, 1.06, 1, 1] }, transition));
      if (ring) {
        playing.push(animate(ring, { opacity: [0, 1, 0.15, 1, 0, 0] }, transition));
      }
    }

    const timer = window.setTimeout(
      () => chip.removeAttribute(LIVE_VALUE_CHANGE_ATTR),
      LIVE_VALUE_CHANGE_MARK_MS,
    );

    return () => {
      window.clearTimeout(timer);
      chip.removeAttribute(LIVE_VALUE_CHANGE_ATTR);
      for (const animation of playing) animation.stop();
    };
  }, [value, reducedMotion]);

  return { chipRef, ringRef, labelRef };
}
