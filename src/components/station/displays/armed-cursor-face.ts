/** Character-select armed-cursor face tokens — Displays Root Index golden. */

/** Shared width budget for tone chip — tabular, no layout expand. */
export const ARMED_CURSOR_CHIP_FACE_CLASS =
  'min-w-10 shrink-0 truncate rounded-none px-1.5 py-0.5 text-center text-role-micro font-semibold uppercase tracking-widest tabular-nums';

/** Armed chevron ink — operator accent (pulse applied separately). */
export const ARMED_CURSOR_CHEVRON_CLASS = 'h-4 w-4 shrink-0 text-accent-bg';

/**
 * Armed bottom track — operator accent (pulse applied separately).
 * Compose on the armed row only; never a local `bg-amber-*` twin.
 */
export const ARMED_CURSOR_TRACK_CLASS =
  'pointer-events-none absolute inset-x-0 bottom-0 z-raised h-0.5 bg-accent-bg';

/**
 * Marker opacity pulse — compose onto chevron / track when motion is allowed.
 * Bare `animate-pulse` (not `motion-safe:`) so OS Reduce Motion is handled in
 * JS via {@link useReducedMotion}, not a silent CSS no-op.
 */
export const ARMED_CURSOR_MARKER_PULSE_CLASS = 'animate-pulse';
