/**
 * Kiosk COMMAND vocabulary — the center work surfaces, and which one a
 * counter opens on. Pure; no React, no icons, no DB.
 *
 * ## Why this is its own module
 *
 * `KioskCommandId` was declared in `kiosk-session-store.ts`, a `'use client'`
 * module, and imported as a type by two SERVER files (`counter/session-events`,
 * `counter/session-store`) plus the settings schema would have been a third.
 * The vocabulary is not a client concern — `counter_sessions.active_command`
 * carries these strings under a CHECK constraint
 * (`migrations/2026-08-20a_counter_sessions.sql:134`) — so it lives here and
 * both sides import it. The store keeps its public API by importing, not by
 * re-declaring.
 *
 * ## Two commands, not four
 *
 * Buyback and Pickup were deleted 2026-09-23 (operator: *"delete all of the
 * components that are not currently adhering to the rules … I will build it
 * up by what exactly I'm doing at each step"*). Neither face met the kiosk
 * law — each stacked a title that repeated the mode name, Pickup ran its
 * lookup as body fields instead of the header search — and neither had ever
 * recorded anything: 0 `pickup_signed_at`, 0 buyback lines on a transaction.
 * The column's CHECK still ADMITS `buyback` / `pickup`; a wider CHECK is
 * harmless, and every read goes through {@link parseKioskCommandId}, so a
 * stray stored value opens the fallback instead of a pane that no longer
 * exists. Re-adding a command is one entry here plus its tile in
 * `services.ts`.
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
 * Affected API: none. Schemas: `counter_sessions.active_command` (a subset).
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
