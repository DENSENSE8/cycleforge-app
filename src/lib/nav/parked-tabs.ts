/**
 * **THE PARKED-TAB LEDGER — a tab that does not work does not get a door.**
 *
 * Operator ruling 2026-09-15, verbatim: *"focused on parking and removing the
 * tabs and displays from the code base … just focusing on simplifying
 * everything. These are all the tabs that are not working properly … inside of
 * the parent level inventory you will be parking health, quick picks, reason
 * codes, replenish, graph, pulse, tracking exceptions."*
 *
 * This is the CHILD-altitude twin of {@link LANE_MOBILE_FIRST} in
 * `@/lib/nav/lanes`, and it is written in the same shape on purpose. That gate
 * hides a whole LANE (Sales · Support), which is the wrong instrument here:
 * Inventory itself is in daily desktop use and must keep its row. What has to
 * go is seven TABS inside it.
 *
 * Three properties are what make the lane gate work, and none of them is the
 * flag — so they are reproduced here rather than a `parked?: true` being
 * sprinkled across `SIDEBAR_PAGE_NAV`:
 *
 * 1. **The set is enumerable in one file.** A porting backlog you cannot read
 *    in one place is not a backlog. This list IS the queue of tabs owed a
 *    working body.
 * 2. **One funnel reads it.** `filterPageChildren` is to a tab what
 *    `getSidebarNavItems` is to a lane: the spine, the desk tab band, the ⌘K
 *    palette and the header page switcher all pass through it, so a door
 *    cannot be re-granted by a caller that forgot the gate.
 * 3. **A test asserts the parked set reaches no surface** —
 *    `parked-tabs.test.ts`, in verify's **Unit tests** gate.
 *
 * Two consequences an editor must not "tidy away":
 *
 * - **Parking removes the DOOR, not the route.** `/inventory/pulse`,
 *   `/inventory/graph`, `?section=replenish` all still resolve for a bookmark,
 *   and each child keeps its `to()` and its `resolveChild()` clause so a pasted
 *   URL still lands. The tab band then lights nothing, which is the same honest
 *   shape the ex-admin inventory desks already wear (`resolveChild` → `null`).
 *   Deleting a surface is its own gated increment.
 * - **Unparking is one line.** Delete the entry once the tab works; that single
 *   line is what a fix increment closes with. Retire a tab for good by deleting
 *   its child row, its `resolveChild` clause and its route — not by leaving a
 *   permanent entry here.
 */

/** `"<pageId>:<childId>"` — the same key `nav-destinations` uses for a child row. */
export type ParkedTabKey = `${string}:${string}`;

/**
 * Parked tab doors, with the reason each one is owed.
 *
 * Keep the value a short sentence naming what is broken: it is what the next
 * operator reads when deciding whether to fix or retire.
 */
export const PARKED_TABS: Readonly<Record<ParkedTabKey, string>> = {
  // Inventory (operator 2026-09-15) — the whole ex-admin + analytics half of
  // the desk. Ledger · Stock · Locations stay: those are the tabs that work.
  'inventory:triage': 'Tracking Exceptions — Zoho re-query path unreliable.',
  'inventory:pulse': 'Pulse — throughput board not reading live movement.',
  'inventory:graph': 'Graph — stock-flow view incomplete.',
  'inventory:replenish': 'Replenish — `?section=replenish` body is a stub.',
  'inventory:reason-codes': 'Reason Codes — ex-admin CRUD, unported to the desk frame.',
  'inventory:favorites': 'Quick Picks — ex-admin CRUD, unported to the desk frame.',
  'inventory:health': 'Health — rollout/drift board, quick-links only.',
};

/** False when this tab has no door on any surface (the parked-tab gate). */
export function isTabParked(pageId: string, childId: string): boolean {
  return `${pageId}:${childId}` in PARKED_TABS;
}
