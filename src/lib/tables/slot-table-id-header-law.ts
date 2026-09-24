/**
 * THE ID HEADER LAW — column one says `Id`, everywhere, once.
 *
 * Operator 2026-09-15: *"the ID as the first column so it'll always display
 * the ID as the first column in the header instead of differences"* — both
 * halves explicit: the word is `Id` on every peer that HAS an identity column,
 * and it lands in one pass rather than a per-desk trickle.
 *
 * ## What actually drifted (measured 2026-09-16, not quoted)
 *
 * The field catalogs hold **40 distinct identity labels**, but that is the
 * Fields-picker vocabulary. What an operator SEES is column one, and across
 * the 48 product-default materializations that was **22 distinct words**:
 *
 * | count | word |
 * |---|---|
 * | 12 | Id (the families that never overrode) |
 * | 5 | SKU · 5 Product · 4 Order · 3 Bin · 2 Unit · 2 Device |
 * | 1 each | Serial · Campaign · TSN id · Order id · Location · Session · Entity id · Staff # · Tracking · Sale · Barcode · Item · Staff · Task · Identity |
 *
 * `Order` · `Order id` · `Order number`, `Staff` · `Staff #`, `Id` · `Entity
 * id` · `TSN id` are the same fact wearing different words. That is drift
 * inside one concept, which is what makes this a law and not a preference.
 *
 * ## The mechanism, not the 40 strings
 *
 * Twenty-two `*-grid-layout.ts` modules each carry their own copy of
 *
 * ```ts
 * if (t.key === 'fulfillment' && identity) {
 *   return { ...t, label: identity.label, gridLabel: identity.label, … };
 * }
 * ```
 *
 * **That duplication IS the drift engine.** `label: identity.label` means the
 * header is whatever word a family's catalog happened to pick, chosen in 22
 * independent places. Renaming catalog labels would fix today's symptom and
 * leave the mechanism: the 23rd family mints the 23rd word. So the rule is
 * structural, not lexical:
 *
 * > **The engine sets the identity header. No family may re-declare it.**
 *
 * Enforced three ways, because a rule with one gate is a comment:
 * `slot-table-id-header-law.test.ts` (every materialization), the `Id header`
 * gate in `verify:fast` (source read, sub-second), and an ESLint rule that
 * fires on the edit that reintroduces `label:` in a `fulfillment` branch.
 *
 * ## What the catalog label still does
 *
 * Everything except the column header: it is the Fields-picker row, the
 * `ds_contract` answer, and the hover/aria word on the cell. That is the
 * compromise that makes a uniform header affordable — the specific word stays
 * reachable where an operator needs it, and the cell content disambiguates on
 * sight (`C-04-09-2-00` is not `00045-P-2-BK`).
 *
 * This module imports nothing. It is a leaf so the tripwire, the guard script
 * and the design-MCP adjudicator can all load it.
 */

/** The one word. */
export const SLOT_TABLE_ID_HEADER_WORD = 'Id' as const;

/**
 * Track keys that ARE the identity column.
 *
 * `fulfillment` is the compound skeleton's identity slot — an Orders-era key
 * name for what is now every family's id chip. `identity` is the tech-all
 * sheet's own frozen identity pane. Both are structural slots: a family binds
 * a fact into them, it does not get to name them.
 */
export const SLOT_TABLE_IDENTITY_TRACK_KEYS = ['fulfillment', 'identity'] as const;

export type SlotTableIdentityTrackKey = (typeof SLOT_TABLE_IDENTITY_TRACK_KEYS)[number];

const IDENTITY = new Set<string>(SLOT_TABLE_IDENTITY_TRACK_KEYS);

/** True when this track is the identity column and must read {@link SLOT_TABLE_ID_HEADER_WORD}. */
export function isSlotTableIdentityTrack(key: string): boolean {
  return IDENTITY.has(key);
}

/**
 * POSITION is already invariant — do not "fix" it.
 *
 * The compound skeleton mounts `select · fulfillment · thumb · item · dates ·
 * state · status:N · _fill` in fixed order and `select` is a gutter, so the
 * identity is already the first DATA column on every compound peer. Stated
 * here as a claim the tripwire checks against `COMPOUND_COLUMN_KEYS`; nothing
 * re-orders anything.
 */
export const SLOT_TABLE_ID_HEADER_POSITION =
  'The identity track is the first non-chrome track of the mounted skeleton. Asserted over COMPOUND_COLUMN_KEYS; never re-ordered per family.' as const;

/**
 * Modules that materialize a `fulfillment` track and therefore MUST NOT set
 * its `label` / `gridLabel`. Shrink-only: an entry leaves when the family
 * ports onto a `SlotTableFamily` record (`slot-table-family.ts`) and stops
 * owning a column module at all — `sku-bins` and the since-retired
 * `location-stock` already had, which is why 24 measured 22 by the time this
 * law was written.
 *
 * Never append. A new column module fails the cohort tripwire first
 * (`SLOT_TABLE_COLUMN_MODULE_DEBT`), and this list second.
 */
export const SLOT_TABLE_ID_HEADER_FILES = [
  'src/components/admin/sourcing/part-compatibility-grid-layout.ts',
  'src/components/inventory/allocations-grid/unit-allocations-grid-layout.ts',
  'src/components/inventory/bulk-allocate-grid/admin-bulk-allocate-grid-layout.ts',
  'src/components/inventory/cycle-count-lines/cycle-count-lines-grid-layout.ts',
  'src/components/inventory/cycle-counts/cycle-counts-grid-layout.ts',
  'src/components/inventory/drift-grid/admin-drift-alerts-grid-layout.ts',
  'src/components/inventory/drift-grid/admin-sku-drift-grid-layout.ts',
  'src/components/inventory/holds-grid/admin-holds-grid-layout.ts',
  'src/components/inventory/returns-grid/admin-returns-grid-layout.ts',
  'src/components/inventory/sku-ledger-grid/sku-ledger-grid-layout.ts',
  'src/components/inventory/tsn-links-grid/unit-tsn-links-grid-layout.ts',
  'src/components/reports/report-bin-utilization-grid/report-bin-utilization-grid-layout.ts',
  'src/components/reports/report-dead-stock-grid/report-dead-stock-grid-layout.ts',
  'src/components/reports/report-staff-day-grid/report-staff-day-grid-layout.ts',
  'src/components/reports/report-velocity-grid/report-velocity-grid-layout.ts',
  'src/components/search/hits-grid/search-hits-grid-layout.ts',
  'src/components/settings/audit-log/audit-log-grid-layout.ts',
  /**
   * The one SHEET family with a real identity slot (`identity`, frozen, its
   * fact is `tech-all.item`). It declares the word in its own skeleton rather
   * than a `fulfillment` branch, so the ESLint rule cannot see it — the unit
   * gate is what holds this one.
   */
  'src/lib/tech/tech-all-grid-layout.ts',
  'src/components/settings/kiosk-devices/kiosk-devices-grid-layout.ts',
  'src/components/settings/kiosk-slot-events/kiosk-slot-events-grid-layout.ts',
  'src/components/settings/sessions/auth-sessions-grid-layout.ts',
  'src/components/settings/staff-directory/staff-directory-grid-layout.ts',
  'src/components/walk-in/grid/walk-in-sales-grid-layout.ts',
] as const;

/**
 * Sheet peers whose column one is NOT an identity track — deliberately out of
 * scope, with the evidence, because the handoff that ordered this law flagged
 * the sheet morph as unverified and it turned out to matter.
 *
 * These are hand sheet skeletons with no identity SLOT: their first column is
 * the product TITLE, or a bare fact column that happens to sit first. Renaming
 * a product-title header to `Id` would be a wrong answer dressed as
 * consistency — the Catalog desk's first column really is the product's name.
 *
 * They inherit the law for free when they port onto the record and gain a real
 * identity track. Until then this list is the honest statement of where the
 * word is still theirs, and the tripwire holds it EXACT so a family cannot
 * quietly join it to escape the rule.
 */
export const SLOT_TABLE_NO_IDENTITY_TRACK_PEERS: readonly {
  columns: string;
  firstKey: string;
  word: string;
  why: string;
}[] = [
  {
    columns: 'READY_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Product',
    why: 'Recently-tested units: column one is the product name, not a handle. The unit serial rides a later track.',
  },
  {
    columns: 'PICKUP_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Product',
    why: 'Local pickup lists what the customer is collecting; the order number is its own track.',
  },
  {
    columns: 'UNFOUND_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Product',
    why: 'Unfound queue is a hunt by product title — the row has no id until it is matched.',
  },
  {
    columns: 'CATALOG_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Product',
    why: 'Products catalog: the product name IS the row. SKU is a bound track beside it.',
  },
  {
    columns: 'REPAIR_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Product',
    why: 'Repair queue reads by product; the unit serial is a track.',
  },
  {
    columns: 'WARRANTY_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Item',
    why: 'Warranty claims: column one is the claimed item, and the claim number is its own track.',
  },
  {
    columns: 'MY_DAY_SHEET_COLUMNS',
    firstKey: 'task',
    word: 'Task',
    why: "Home · Today lists a staffer's tasks by their sentence. A task has no operator-facing handle.",
  },
  {
    columns: 'TRACKING_EXCEPTIONS_SHEET_COLUMNS',
    firstKey: 'title',
    word: 'Tracking',
    why: 'The tracking number is painted in the TITLE cell of a hand sheet, not in an identity slot.',
  },
  {
    columns: 'UNITS_SHEET_COLUMNS',
    firstKey: 'serial',
    word: 'Serial',
    why: 'Hand sheet skeleton: `serial` is a fact column that happens to sit first, not a bound identity slot.',
  },
  {
    columns: 'BINS_SHEET_COLUMNS',
    firstKey: 'barcode',
    word: 'Barcode',
    why: 'Hand sheet skeleton: `barcode` is a fact column, not a bound identity slot.',
  },
  {
    columns: 'CSV_IMPORT_STAGING_SHEET_COLUMNS',
    firstKey: 'order',
    word: 'Order',
    why: 'Staging sheet skeleton: `order` is a fact column, not a bound identity slot.',
  },
];

/** The sentence a refusal prints — one place, so the gate and the tool agree. */
export const SLOT_TABLE_ID_HEADER_REFUSAL =
  "The identity header is the engine's. Delete the `label` / `gridLabel` lines from the `fulfillment` branch — the column reads `Id` on every peer (operator 2026-09-15). Keep `fieldId`, `type: 'id'` and `slotDisplayType`: those are real per-family facts. The catalog label stays the Fields-picker row and the cell's hover word." as const;
