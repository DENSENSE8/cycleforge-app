/**
 * **THE PARKED-TAB LEDGER — a tab that does not work does not get a door.**
 * Operator ruling 2026-09-15, verbatim: *"focused on parking and removing the
 */

/** `"<pageId>:<childId>"` — the same key `nav-destinations` uses for a child row. */
type ParkedTabKey = `${string}:${string}`;

/**
 * Parked tab doors, with the reason each one is owed.
 *
 * Keep the value a short sentence naming what is broken: it is what the next
 * operator reads when deciding whether to fix or retire.
 */
export const PARKED_TABS: Readonly<Record<ParkedTabKey, string>> = {
  // Inventory (operator 2026-09-15) — the whole ex-admin + analytics half of
  // the desk. Ledger · Stock · Locations · Replenish stay: those are the tabs that work.
  'inventory:triage': 'Tracking Exceptions — Zoho re-query path unreliable.',
  'inventory:pulse': 'Pulse — throughput board not reading live movement.',
  'inventory:graph': 'Graph — stock-flow view incomplete.',
  'inventory:reason-codes': 'Reason Codes — ex-admin CRUD, unported to the desk frame.',
  'inventory:favorites': 'Quick Picks — ex-admin CRUD, unported to the desk frame.',
  'inventory:health': 'Health — rollout/drift board, quick-links only.',
};

/** False when this tab has no door on any surface (the parked-tab gate). */
export function isTabParked(pageId: string, childId: string): boolean {
  return `${pageId}:${childId}` in PARKED_TABS;
}
