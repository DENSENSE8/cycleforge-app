/**
 * Welcome motion grammar — the ONLY timing source for the post-sign-in welcome
 * (WelcomeAssembly, SplitText, AmbientLayer, particles). Themes restyle shape,
 * colour and glyph variant; they never introduce timing. Tune here, nowhere else.
 *
 * Principles (first-principles, not taste):
 *  - Arrivals decelerate (ease-out): real objects shed speed as they come to rest.
 *  - Departures accelerate (ease-in) and are shorter than arrivals: attention has
 *    already moved on, so a lingering exit reads as lag.
 *  - Spatial travel is a spring: it is interruptible and keeps velocity when a
 *    target changes mid-flight (e.g. the search rect resolving late).
 *  - Ambient motion is slow, mirrored, transform-only: it must never compete with
 *    content and never repaint (no animated filter/blur).
 *  - Reduced motion = short opacity crossfades, no travel, no per-glyph motion.
 */
import type { Transition } from 'motion/react';

type CubicBezier = readonly [number, number, number, number];

/** Decelerate — arriving objects slow into place (expo-ish out). */
export const EASE_OUT: CubicBezier = [0.16, 1, 0.3, 1];
/** Accelerate — leaving objects speed away (quart in). */
export const EASE_IN: CubicBezier = [0.7, 0, 0.84, 0];
/** Symmetric — ambient loops breathe; neither end is an arrival. */
export const EASE_IN_OUT: CubicBezier = [0.45, 0, 0.55, 1];

/** Entries: ~0.42s is long enough to read the arrival, short enough to feel instant. */
export const enter: Transition = { duration: 0.42, ease: EASE_OUT };

/** Exits: ~0.26s, ≈60% of an entry — leaving things should not hold the stage. */
export const exit: Transition = { duration: 0.26, ease: EASE_IN };

/**
 * Spatial travel: lively but damped spring. Low mass keeps it quick; the
 * stiffness/damping ratio allows a hint of life without a visible bounce.
 */
export const move: Transition = { type: 'spring', stiffness: 250, damping: 20, mass: 0.5 };

/** Settle: critically-damped-ish spring — lands with no visible overshoot (avatars, card size). */
export const settle: Transition = { type: 'spring', stiffness: 220, damping: 30, mass: 0.6 };

/**
 * Ambient drift loop: mirror-repeating sine-like ease over half the period so a
 * full out-and-back takes `periodS`. Transform-only by contract.
 */
export function drift(periodS: number): Transition {
  return {
    duration: Math.max(periodS, DRIFT_MIN_PERIOD_S) / 2,
    ease: EASE_IN_OUT,
    repeat: Infinity,
    repeatType: 'mirror',
  };
}
/**
 * Particle fall loop: linear (gravity at terminal velocity looks constant), restarts
 * from the top. `delayS` desynchronises particles so they never fall as a sheet.
 */
export function fall(durationS: number, delayS = 0): Transition {
  return { duration: Math.max(durationS, FALL_MIN_S), ease: 'linear', repeat: Infinity, repeatType: 'loop', delay: delayS };
}
/** A particle crossing the viewport faster than this reads as rain, not ambience. */
export const FALL_MIN_S = 8;

/** Below ~6s a "drift" starts to read as a wobble that asks for attention. */
export const DRIFT_MIN_PERIOD_S = 6;

/** Per-glyph stagger: 28ms reads as a single sweep rather than individual letters. */
export const charStagger = 0.028;
/** Cap on the whole glyph sweep so long names never delay the sequence. */
export const CHAR_STAGGER_MAX_TOTAL_S = 0.7;

/** Stagger per glyph for a string of `count` glyphs, respecting the total cap. */
export function charStaggerFor(count: number): number {
  if (count <= 1) return 0;
  return Math.min(charStagger, CHAR_STAGGER_MAX_TOTAL_S / (count - 1));
}

/** Glyph entry (per-char): a touch shorter than `enter` — many small things arriving. */
export const charEnter: Transition = { duration: 0.36, ease: EASE_OUT };
/** Glyph exit (per-char): as `exit`, glyphs just leave. */
export const charExit: Transition = { duration: 0.2, ease: EASE_IN };
/** Glyph flicker (candle/ember): opacity keyframes over one entry-length. */
export const charFlicker: Transition = { duration: 0.5, ease: 'linear', times: [0, 0.3, 0.45, 0.6, 1] };

/**
 * Perceived-constant speed: duration grows with travel distance but sub-linearly
 * (sqrt), clamped so tiny moves are not instant and screen-wide moves are not slow.
 */
export const TRAVEL_MIN_S = 0.32;
export const TRAVEL_MAX_S = 0.72;
export function durationForDistance(px: number): number {
  const d = Math.abs(px);
  // ~0.018 s per sqrt(px): 400px ≈ 0.36s, 1200px ≈ 0.62s.
  return Math.min(TRAVEL_MAX_S, Math.max(TRAVEL_MIN_S, 0.018 * Math.sqrt(d)));
}
/** Tween travel for a known distance (used when a spring can't be timed, e.g. hand-off). */
export function travel(px: number): Transition {
  return { duration: durationForDistance(px), ease: EASE_OUT };
}

/** Reduced motion: opacity-only crossfades; short so nothing feels withheld. */
export const reducedMotion = {
  enter: { duration: 0.2, ease: 'linear' } as Transition,
  exit: { duration: 0.16, ease: 'linear' } as Transition,
  /** Replaces `move`: no travel — crossfade at the destination. */
  move: { duration: 0.2, ease: 'linear' } as Transition,
  settle: { duration: 0.2, ease: 'linear' } as Transition,
} as const;

/** Pick full or reduced tokens. */
export function grammar(reduced: boolean) {
  return reduced
    ? { enter: reducedMotion.enter, exit: reducedMotion.exit, move: reducedMotion.move, settle: reducedMotion.settle }
    : { enter, exit, move, settle };
}

/**
 * Phase timings (seconds). Tuning table — each value is the length of a beat
 * or the gap before one; the sequence always waits on real readiness too.
 *  GREETING_DELAY   glyph sweep starts one beat after mount, once the resting frame
 *                   (handed over from WelcomeBridge / the boot script) has painted.
 *  AVATAR_DELAY     the avatar settles alongside the first glyphs, not after them.
 *  HOLD             the full greeting stays readable (≈ 2–3 fixations on one line).
 *  NAME_EXIT_GAP    pause after the name leaves and the card narrows, before it
 *                   travels — "the name left" reads as its own beat.
 *  MORPH_HANDOFF    landed card → real search: radius → 0 before it dissolves.
 *  REGION_LEAD      after the previous region settles, before the next may start.
 *  MAIN_LEAD        main is the biggest move of the spotlight: a touch more lead.
 *  REGION_LOCK      a ready region sits under the spotlight before its veil lifts.
 *  FOCUS_HOLD       the agenda alone unveiled (count ticking) before the rest of main.
 *  VEIL_LIFT        a region's veil fading back into its rounded inset.
 *  END              ambient shapes leave + spotlight dissolves; the overlay's own `exit` fills the beat's tail.
 *  CHIP_LIFE        an arrival chip's time on screen.
 *  SKIP_HINT_DELAY  the skip caption waits until the user has seen something happen.
 *  GLINT_DELAY      after the name's glyphs have landed, the glint sweeps within HOLD.
 *  GLINT            the glint's sweep across the name.
 *  COLOR_TWEEN      staff colour arriving late (cache fill) tweens the palette.
 *  RECEDE           ambient layer dims behind the regions once the card is gone.
 *  HARD_CAP         absolute ceiling on the welcome; never blocks the page longer.
 *  BOOT_BRIDGE_SAFETY  the pre-hydration frame removes itself if hydration never
 *                   mounts WelcomeGate (HARD_CAP + hydration headroom).
 */
export const PHASE = {
  GREETING_DELAY: 0.12,
  AVATAR_DELAY: 0.04,
  HOLD: 0.9,
  NAME_EXIT_GAP: 0.12,
  MORPH_HANDOFF: 0.3,
  REGION_LEAD: 0.12,
  MAIN_LEAD: 0.14,
  REGION_LOCK: 0.18,
  FOCUS_HOLD: 0.36,
  VEIL_LIFT: 0.46,
  END: 0.62,
  CHIP_LIFE: 1.6,
  SKIP_HINT_DELAY: 0.8,
  GLINT_DELAY: 0.05,
  GLINT: 0.8,
  COLOR_TWEEN: 0.45,
  RECEDE: 0.6,
  HARD_CAP: 8,
  BOOT_BRIDGE_SAFETY: 10,
} as const;

/** Veil lifting off a region: an arrival of the real content beneath → decelerate. */
export const veilLift: Transition = { duration: PHASE.VEIL_LIFT, ease: EASE_OUT };
/** Landed card flattening onto the search well: decelerate into the real control. */
export const handoff: Transition = { duration: PHASE.MORPH_HANDOFF, ease: EASE_OUT };
/** Glint sweep: symmetric — it passes through, it neither arrives nor leaves. */
export const glint: Transition = { delay: PHASE.GLINT_DELAY, duration: PHASE.GLINT, ease: EASE_IN_OUT };
/** Palette tween when the staff colour lands late. */
export const colorTween: Transition = { duration: PHASE.COLOR_TWEEN, ease: EASE_OUT };
/** Ambient layer receding behind the regions. */
export const recede: Transition = { duration: PHASE.RECEDE, ease: EASE_OUT };
/** Ambient shapes leaving at the end: a departure, but a slow one (background). */
export const ambientLeave: Transition = { duration: PHASE.END, ease: EASE_IN };
/** Skip caption: an entry, deferred. */
export const skipHint: Transition = { ...enter, delay: PHASE.SKIP_HINT_DELAY };
/** No motion (reduced-motion snaps where even a crossfade would be noise, e.g. a ring's fill). */
export const instant: Transition = { duration: 0 };

/** Seconds → ms for setTimeout-driven phase transitions. */
export const ms = (s: number): number => Math.round(s * 1000);
