/**
 * Kiosk idle timing — how long the counter tablet sits untouched before it
 * asks "are you still there?", and how long after that it falls to attract.
 *
 * ONE resolver, because two surfaces read the same answer: the shell counts
 * down against `promptAtS` / `attractAtS`, and the prompt renders the remaining
 * seconds between them. A second copy of the arithmetic is how a countdown
 * comes to disagree with the thing it is counting down to.
 *
 * Pure + client-safe: no DB, no server-only imports.
 */

/** Inactivity before the "still there?" prompt when the org sets nothing. */
export const DEFAULT_KIOSK_IDLE_PROMPT_S = 60;

/**
 * Seconds the prompt stays up before attract takes over. FIXED, not tenant
 * config: it is a reaction window for a customer who has already been asked a
 * question, not a branding knob, and an org that shortened it to 1s would ship
 * a prompt nobody can read.
 */
export const KIOSK_IDLE_PROMPT_GRACE_S = 10;

/**
 * Bounds on the tenant value. The floor keeps a counter tablet from blanking
 * mid-signature; the ceiling keeps "disable attract" from being expressed as a
 * number so large the reel silently never plays — that is a feature request
 * (an explicit off switch), not a timeout.
 */
export const MIN_KIOSK_IDLE_PROMPT_S = 15;
export const MAX_KIOSK_IDLE_PROMPT_S = 3600;

interface KioskIdleTiming {
  /** Idle seconds at which the "still there?" prompt shows. */
  promptAtS: number;
  /** Idle seconds at which attract takes the screen. */
  attractAtS: number;
}

/**
 * Resolve `settings.kiosk.idleTimeoutSeconds` (org JSON, unvalidated at the
 * edge) into the two thresholds the shell counts against.
 *
 * Absent / unparseable / out of range degrades to the default rather than
 * throwing — an unattended tablet must keep working through a bad settings
 * value, and a screensaver is not worth a blank screen.
 */
export function resolveKioskIdleTiming(raw: unknown): KioskIdleTiming {
  const promptAtS = clampIdlePromptSeconds(raw);
  return { promptAtS, attractAtS: promptAtS + KIOSK_IDLE_PROMPT_GRACE_S };
}

/** Clamp an arbitrary settings value to a legal prompt threshold. */
export function clampIdlePromptSeconds(raw: unknown): number {
  // Absence must be decided BEFORE Number(): Number(null), Number('') and
  // Number([]) are all 0 — finite, so a bare coercion would clamp an *unset*
  // org to the 15s floor and blank the counter tablet every 25 seconds.
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    n = Number(raw);
  } else {
    return DEFAULT_KIOSK_IDLE_PROMPT_S;
  }
  if (!Number.isFinite(n)) return DEFAULT_KIOSK_IDLE_PROMPT_S;
  const whole = Math.round(n);
  if (whole < MIN_KIOSK_IDLE_PROMPT_S) return MIN_KIOSK_IDLE_PROMPT_S;
  if (whole > MAX_KIOSK_IDLE_PROMPT_S) return MAX_KIOSK_IDLE_PROMPT_S;
  return whole;
}
