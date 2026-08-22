'use client';

/**
 * `useLiveValueChange` — the attention pulse & morph a collection-row VALUE
 * runs when someone ELSE changed the fact behind it.
 *
 * ## The job (and why it is not `feedback.pulse`)
 *
 * `feedback.pulse` / `feedback.hitMarker` acknowledge an action the operator
 * just took, on the element under their own cursor: 100–150ms of opacity is
 * plenty because they are already looking at the target. This hook fires on an
 * element **nobody is looking at**. A tester scans a tracking number at the
 * bench; the packer's board is 40 rows of near-identical text two surfaces
 * away, and the change has to be findable in peripheral vision without the
 * operator re-reading the table. That is a different job, so it is a different
 * role — `motionRole.feedback.liveChange`.
 *
 * Shape (one shot, ~420ms):
 *
 * ```text
 * [value changed]
 *   ├─ pulse 1  (0–130ms)   chip scale 1.06 + ring overlay flash
 *   │   └─ morph (0–180ms)  label opacity dip — the word changes mid-beat
 *   ├─ pulse 2  (130–260ms) the beat that separates "signal" from "repaint"
 *   └─ settle   (260–420ms) back to rest, ring fades out
 * ```
 *
 * ## Two things it deliberately does NOT do
 *
 * **It never holds the old value.** The originating spec revealed the new text
 * at the peak of the SECOND pulse, i.e. the cell showed a stale status for
 * ~300ms after the fact had already changed. On a warehouse floor that is
 * chrome telling a story the data no longer supports (Kinetic Ledger law 1),
 * so the new truth paints immediately and the morph marks the swap instead of
 * staging it.
 *
 * **It never moves the box.** Transform + opacity only — no `box-shadow`
 * spread, no width, no translate. A status chip lives in a ruled grid band
 * shared with 40 other rows; reflowing that band to report a word change is
 * worse than not reporting it. (`motion-crossfade.md` → a live grid cell
 * update flashes.)
 *
 * ## Cost
 *
 * Imperative `animate(element, …)`, not a `motion.*` component: a row that did
 * not change pays two refs and one effect, and no animation machinery is
 * constructed at all. That is what makes this safe to put on the shared status
 * cell of every dense table in the app.
 *
 * Reduced motion gets the accepted substitute, not silence: the label still
 * crossfades (the class swap is already an instant colour morph), the pulse
 * and the ring are suppressed.
 *
 * Law: roles + reduced motion.
 */

import { useEffect, useRef, type RefObject } from 'react';

import { motionRole } from './roles';
import { animate, useReducedMotion } from './framer';

/**
 * Marks the chip for the duration of the pulse. The row wash in `globals.css`
 * keys off this via `[data-order-row-id]:has([data-live-value-change])` — the
 * row is a different owner's DOM, so it is reached by selector rather than by
 * threading a prop through six surfaces.
 */
export const LIVE_VALUE_CHANGE_ATTR = 'data-live-value-change';

/**
 * How long the mark stays on, in ms. Deliberately LONGER than the chip pulse
 * (420ms): the pulse has to be caught in peripheral vision, the row wash has to
 * still be there when the eye arrives. Must stay in step with the
 * `cf-live-row-wash` duration in `globals.css` — if the attribute is pulled
 * first, the wash cuts out mid-fade instead of finishing.
 */
export const LIVE_VALUE_CHANGE_MARK_MS = 1400;

/**
 * Should a value transition run the pulse?
 *
 * Extracted as a pure predicate because every false-positive here is an
 * operator being told a scan happened when none did:
 *
 * - **First observation** (`previous === undefined`) is a MOUNT, not a change.
 *   A row scrolling into a virtualized window must not flash — and it would,
 *   constantly, if mount counted. This is the load-bearing guard: the
 *   virtualizer keys rows by record id, so a row entering the window is always
 *   a first observation and can never look like a transition.
 * - **A value that appears** on a row already on screen (`null → 'Station 2'`,
 *   the pack bench a tracking scan just assigned) IS a change and DOES pulse.
 *   The chip element is new but the ROW is not, which is the distinction that
 *   matters — the operator was already looking at this line.
 * - **A value that disappears** cannot pulse: the cell falls back to the em
 *   dash, so there is no chip element left to animate.
 * - **An identical value** re-rendered (a refetch that changed some other
 *   column) is not a change on THIS cell.
 */
export function shouldPulseLiveValue(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (previous === undefined) return false;
  if (next == null) return false;
  return previous !== next;
}

export interface LiveValueChangeRefs {
  /** The chip itself — carries the double-pulse scale. */
  chipRef: RefObject<HTMLSpanElement>;
  /** Absolute inset-0 ring overlay — carries the flash. Never scaled (a halo
   *  that grows past the chip gets clipped by the cell's own overflow). */
  ringRef: RefObject<HTMLSpanElement>;
  /** The label text — carries the morph dip. */
  labelRef: RefObject<HTMLSpanElement>;
}

/**
 * Watch `value`; pulse the returned refs when it changes under a mounted chip.
 *
 * Interruptible by design: the keyframe arrays lead with `null` (Motion's
 * keyframe wildcard) so a second scan landing mid-pulse restarts from the
 * CURRENT scale instead of snapping back to rest first.
 */
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
