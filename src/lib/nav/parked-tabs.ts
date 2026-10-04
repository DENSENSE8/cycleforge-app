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
  // Inventory (operator 2026-09-15) — unfinished non-table tools stay hidden.
  // Retired compound-grid destinations are redirected at the route boundary instead.
  'inventory:triage': 'Tracking Exceptions — Zoho re-query path unreliable.',
  'inventory:graph': 'Graph — stock-flow view incomplete.',
  'inventory:reason-codes': 'Reason Codes — ex-admin CRUD, unported to the desk frame.',
  'inventory:favorites': 'Quick Picks — ex-admin CRUD, unported to the desk frame.',
};

/** False when this tab has no door on any surface (the parked-tab gate). */
export function isTabParked(pageId: string, childId: string): boolean {
  return `${pageId}:${childId}` in PARKED_TABS;
}
