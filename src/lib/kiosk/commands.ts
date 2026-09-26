/**
 * Kiosk COMMAND vocabulary — the center work surfaces, and which one a counter opens on.
 * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to sales.
 */

/**
 * Every command id, in the order a counter menu reads them. Also the zod enum
 * behind `OrgSettings.kiosk.defaultCommand`, and a subset of the CHECK
 * vocabulary on `counter_sessions.active_command`.
 */
export const KIOSK_COMMAND_IDS = ['repair', 'retail'] as const;

/** Center work command — not a siloed mode that owns the session. */
export type KioskCommandId = (typeof KIOSK_COMMAND_IDS)[number];

/** The command a counter opens on when its org has expressed no preference. */
export const KIOSK_FALLBACK_COMMAND: KioskCommandId = 'repair';

export function isKioskCommandId(value: unknown): value is KioskCommandId {
  return typeof value === 'string' && (KIOSK_COMMAND_IDS as readonly string[]).includes(value);
}

/** Coerce untrusted input (tenant JSON, a request body, a DB column) to a command id. */
export function parseKioskCommandId(
  value: unknown,
  fallback: KioskCommandId = KIOSK_FALLBACK_COMMAND,
): KioskCommandId {
  return isKioskCommandId(value) ? value : fallback;
}
