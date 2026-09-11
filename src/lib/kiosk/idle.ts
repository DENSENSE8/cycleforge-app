/**
 * Kiosk idle timing — consult tablet (C3).
 *
 * Callers: `KioskV2Runtime` (shell), `idle.test.ts`. Profile PATCH used to
 * persist `idleTimeoutSeconds`; that write is ignored. Schema leftover on
 * `OrgSettings.kiosk.idleTimeoutSeconds`. No new HTTP.
 *
 * The front-desk iPad is a staff-guided consult. An empty cart during
 * conversation is still a visit. No "are you still there?" prompt, no attract
 * reel. A leftover tenant number cannot turn idle back on.
 *
 * User: "ensure that the left padding for the top level tabs... And continue
 * with the next phase." (Phase 1 kill kiosk timeout.)
 */

export interface KioskIdleTiming {
  /** When false the shell must not prompt or fall to attract. */
  enabled: boolean;
  promptAtS: number | null;
  attractAtS: number | null;
}

const IDLE_OFF: KioskIdleTiming = {
  enabled: false,
  promptAtS: null,
  attractAtS: null,
};

/**
 * Resolve org `settings.kiosk.idleTimeoutSeconds` into shell thresholds.
 *
 * **Always off.** The argument is accepted so a leftover tenant number, a
 * string, or garbage JSON cannot re-enable the McDonald’s path.
 */
export function resolveKioskIdleTiming(_raw?: unknown): KioskIdleTiming {
  return IDLE_OFF;
}
