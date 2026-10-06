/**
 * What to do next, per sidebar page — the header's top-left line at rest.
 *
 * Law (owner 2026-09-29): this line NEVER repeats what Find / ⌘K already say
 * (scan or paste a tracking #, order #, serial; search keys). It carries the
 * page's own next step on the floor, the way a guided WMS prompts the single
 * next action (e.g. Unbox: label printed? scan the bin QR it goes to). Keyed
 * by `SIDEBAR_PAGE_NAV` id; a page without an entry shows nothing. Keep each
 * line ≤ 47 characters: it must fit the header slot in one glance.
 */
export const PAGE_NEXT_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  home: ['Past-due and urgent items lead the day', 'Check off the daily checklist as you go'],
  'ai-chat': ['Ask about any order, carton, SKU or shift'],
  sales: ['Walk-in sales, pickups and repairs start here'],
  operations: ['Live is the floor now; History is what happened'],
  imports: ['Check a run’s result before importing again'],
  reports: ['Pick a report, then its date range'],
  'ops-photos': ['Filter by stage to find a carton’s photos'],
  exceptions: ['Clear the oldest exception in each kind first'],
  'print-station': ['Pick the computer at the packer’s table', 'Fix the title or condition before you print'],
  triage: ['Shelve each carton on its dock location', 'Unfound cartons land in Exceptions › Unfound'],
  receive: ['Label printed? Scan the bin QR it goes to', 'Photograph damage before the unit moves on'],
  receiving: ['Label printed? Scan the bin QR it goes to', 'Photograph damage before the unit moves on'],
  pickup: ['Work the top card: next action, oldest first'],
  repair: ['Move each repair on as its status changes'],
  testing: ['Run the QC checklist before you grade the unit'],
  'ready-to-pack': ['Confirm each pull; short picks need a reason'],
  incoming: ['Docked cartons are waiting to be unboxed'],
  sourcing: ['Work the Queue before scouting new sources'],
  fba: ['Build the plan, then combine before it ships'],
  'label-intake': ['Unprinted documents lead; check them, then print'],
  outbound: ['Allocate first: the oldest ship-by leads', 'Out-of-stock orders move to Exceptions'],
  'scan-out': ['Scan out every box that leaves'],
  packer: ['Print the label and papers, then seal the box'],
  products: ['Pairing links SKUs to platform listings'],
  inventory: ['Every stock change needs a reason code'],
  'qc-labels': ['Labels split by where the unit is now'],
  support: ['Link each ticket to its order or carton'],
  studio: ['Library holds the nodes and templates'],
};

/** The page's next-step lines, or none. */
export function pageNextActions(pageId: string | null | undefined): readonly string[] {
  return (pageId && PAGE_NEXT_ACTIONS[pageId]) || [];
}
