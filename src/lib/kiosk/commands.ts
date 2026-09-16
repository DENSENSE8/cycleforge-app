/**
 * Kiosk COMMAND vocabulary — the four center work surfaces, and which one a
 * counter opens on. Pure; no React, no icons, no DB.
 *
 * ## Why this is its own module
 *
 * `KioskCommandId` was declared in `kiosk-session-store.ts`, a `'use client'`
 * module, and imported as a type by two SERVER files (`counter/session-events`,
 * `counter/session-store`) plus the settings schema would have been a third.
 * The vocabulary is not a client concern — `counter_sessions.active_command`
 * carries the same four strings under a CHECK constraint
 * (`migrations/2026-08-20a_counter_sessions.sql:134`) — so it lives here and
 * both sides import it. The store keeps its public API by importing, not by
 * re-declaring.
 *
 * `KIOSK_SERVICES` (`services.ts`) stays the presentation SoT: labels, glyphs,
 * ink, `status: 'live'`. That file pulls JSX, which is exactly why the ids are
 * not in it.
 *
 * ## The default is REPAIR
 *
 * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to sales.
 * It must default to repair service. That is the most common thing."* The store
 * seeded `'retail'` and `counter_sessions.active_command` defaults to
 * `'retail'`, while `/kiosk/v2/page.tsx` already documented the opposite
 * ("`service` is the seeded rail because repair is the kiosk's default
 * command") and seeded the repair catalog rail. The page was right and the
 * state was wrong — the tablet painted a repair-seeded first frame and then
 * booted into Sales.
 *
 * This constant is the FALLBACK, not the answer: the answer is per-org
 * (`OrgSettings.kiosk.defaultCommand` → `getKioskDefaultCommand`), because a
 * shop whose counter is mostly retail must be able to say so. This is what an
 * org that has never chosen gets.
 *
 * Callers: `kiosk-session-store`, `services`, `tenancy/settings`,
 * `counter/session-events`, `counter/session-store`, `/kiosk/v2`.
 * Affected API: none. Schemas: `counter_sessions.active_command` (same four).
 */

/**
 * Every command id, in the order a counter menu reads them. Also the zod enum
 * behind `OrgSettings.kiosk.defaultCommand` and the CHECK vocabulary on
 * `counter_sessions.active_command` — one list, three consumers.
 */
export const KIOSK_COMMAND_IDS = ['repair', 'retail', 'buyback', 'pickup'] as const;

/** Center work command — not a siloed mode that owns the session. */
export type KioskCommandId = (typeof KIOSK_COMMAND_IDS)[number];

/** The command a counter opens on when its org has expressed no preference. */
export const KIOSK_FALLBACK_COMMAND: KioskCommandId = 'repair';

export function isKioskCommandId(value: unknown): value is KioskCommandId {
  return typeof value === 'string' && (KIOSK_COMMAND_IDS as readonly string[]).includes(value);
}

/**
 * Coerce untrusted input (tenant JSON, a request body, a DB column) to a
 * command id. Anything unrecognised becomes `fallback` rather than throwing:
 * a stale or hand-edited settings bag must not be able to stop a counter from
 * opening.
 */
export function parseKioskCommandId(
  value: unknown,
  fallback: KioskCommandId = KIOSK_FALLBACK_COMMAND,
): KioskCommandId {
  return isKioskCommandId(value) ? value : fallback;
}
