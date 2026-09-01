/**
 * Per-table column registry — the single source of truth for which columns a
 * staffer may hide on each shared list table.
 *
 * The five desktop tables (receiving / orders queue / shipped / tech / packer)
 * all render the SAME base row primitives — `ChipColumns` (right-side identity
 * chips, keyed) and `RowMetaColumns` (left-side qty | condition | rest grid).
 * Those primitives now read a per-staff hidden-key set from
 * `TableColumnConfigProvider` and drop matching columns. This registry declares,
 * per table, the toggleable columns + their human labels for a future Fields /
 * columns menu — instead of any table hardcoding which columns exist.
 *
 * Keys MUST match the real column keys the rows emit:
 *   chip group → ChipColumn.key: 'platform' | 'orderid' | 'tracking' | 'serial'
 *                (see ChipColumns)
 *   meta group → RowMetaColumns slot keys: 'qty' | 'condition' | 'rest'
 *
 * A registry entry whose key isn't present on a given row is harmless — the
 * filter simply never matches it. Alignment is preserved row-to-row because
 * every row in a table hides the SAME keys.
 */

/**
 * `meta` / `chip` are the legacy row-primitive slot families (RowMetaColumns /
 * ChipColumns). `grid` marks a table whose columns ARE real spreadsheet tracks
 * declared in a `*-grid-layout` SoT — those never route through the row
 * primitives, so their keys are the grid column keys themselves.
 */
export type TableColumnGroup = 'meta' | 'chip' | 'grid';

/**
 * Presentation data-type of a column — drives the header type glyph (Airtable-
 * style). Resolved to an icon in ONE place (`column-type-glyph.tsx`); views never
 * inline per-column icon choices.
 */
export type ColumnType =
  | 'text'
  | 'number'
  | 'id'
  | 'tag'
  | 'longtext'
  | 'date'
  /** External / marketplace link (platform). */
  | 'external'
  /** Geo / bin / staging place (folded map header glyph). */
  | 'location'
  /** Carrier tracking number (MapPin header glyph — distinct from bin `location`). */
  | 'tracking'
  /** Money / unit cost (Receipt header glyph — distinct from qty `number` Hash). */
  | 'price'
  /** Photo / thumbnail track (Image header glyph — never a blank square). */
  | 'image';

export interface TableColumnSpec {
  /** Must equal the ChipColumn.key or RowMetaColumns slot key it controls. */
  key: string;
  /** Label shown in the column-config popover. */
  label: string;
  group: TableColumnGroup;
  /** Data-type → header glyph (optional; grids that render typed headers set it). */
  type?: ColumnType;
  // NO `align` here. It existed on this registry, was never set by any entry and
  // never read by any consumer — a field that looked like the alignment SoT while
  // the real decision was being re-typed as a ternary in five headers. Alignment
  // now lives on `LedgerGridColumnModel.align`, derived from `type` by
  // `resolveGridColumnAlign`. This registry is the Fields-menu vocabulary only.
}

/** Stable ids for every shared list table that supports column config. */
export type TableId =
  | 'receiving'
  /** Incoming POS spreadsheet — distinct from Unbox/History `receiving`. */
  | 'incoming'
  /**
   * Unbox pinned-Inbound EMBED — its OWN prefs bucket so hiding a heavy column
   * (e.g. Tracking) on the Unbox Inbound tab never touches the full `/incoming`
   * desk density, and vice versa (Gemini D13). Same descriptor / column
   * vocabulary as `incoming`; only the staff-prefs identity differs.
   */
  | 'incoming_embed'
  | 'orders'
  | 'shipped'
  | 'tech'
  | 'testing'
  | 'packer'
  | 'catalog'
  | 'pickup'
  | 'repair'
  /** Support › Warranty claims spreadsheet (`WARRANTY_GRID_COLUMNS`). */
  | 'warranty'
  /** Outbound › Ready / recently-tested history (slot-materialized). */
  | 'ready'
  /** Warehouse › Bins overview spreadsheet (`BINS_GRID_COLUMNS`). */
  | 'bins'
  /** Admin › PO Mailbox / Unfound triage (`UNFOUND_GRID_COLUMNS`). */
  | 'unfound'
  /** Home › Today task spreadsheet (`MY_DAY_GRID_COLUMNS`). */
  | 'my-day'
  /** Tech / Unbox All triage spreadsheet (`TECH_ALL_GRID_COLUMNS`). */
  | 'tech-all'
  /** Review › Catalog link chores (`CATALOG_LINK_GRID_COLUMNS`). */
  | 'catalog-link'
  /**
   * Review › Missing item number (`IMPORT_EXCEPTION_GRID_COLUMNS`) — its own
   * bucket, not `catalog-link`'s. The two tabs share a surface but not their
   * identity facts, so one bucket would mean hiding `source` on one tab
   * silently hid it on the other.
   */
  | 'import-exception'
  /** Ops › Tracking Exceptions spreadsheet (`TRACKING_EXCEPTIONS_GRID_COLUMNS`). */
  | 'tracking-exceptions'
  /** Support › Tickets spreadsheet (`SUPPORT_TICKETS_GRID_COLUMNS`). */
  | 'support-tickets'
  /** Inventory › Units browse spreadsheet (`UNITS_GRID_COLUMNS`). */
  | 'inventory-units'
  /**
   * To-Ship CSV import staging (`CSV_IMPORT_STAGING_GRID_COLUMNS`) — its OWN
   * bucket, never `orders`: hiding a column while triaging a file must not
   * change the density of the live queue those rows are about to land in.
   */
  | 'orders-import'
  /**
   * Home → Daily shift checklist. Its OWN bucket: hiding `team` on a personal
   * checklist must not touch any operator queue's density, and no queue shares
   * these keys.
   */
  | 'daily'
  /**
   * My Tasks (`staff_todos`) — one staffer's own list. Its OWN bucket, never
   * `daily`'s: the two tables answer different questions over different stores
   * (personal list vs the org's shift checklist with a roster), and they share
   * only the word "task".
   */
  | 'tasks'
  /**
   * Amazon Prep › shipment board. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record — the display is being rebuilt.
   */
  | 'fba';

/** Canonical meta-slot keys (the left-side qty | condition | rest grid). */
export const META_KEYS = {
  qty: 'qty',
  condition: 'condition',
  rest: 'rest',
} as const;

/*
 * The shared `META_*` / `CHIP_*` column specs were DELETED with the wave 1.3
 * slot port (2026-08-31).
 *
 * They existed so the receiving-family buckets below could name the same
 * hide-keys without copying them. Every one of those buckets is `[]` now —
 * hiding a fact is unbinding it from a slot — so the specs had no readers left.
 * A shared constant with no consumer is not a SoT, it is a suggestion that the
 * next porter will re-populate a bucket rather than add a catalog field.
 */

const GRID_COL = (key: string, label: string, type?: ColumnType): TableColumnSpec => ({
  key,
  label,
  group: 'grid',
  type,
});

/**
 * Toggleable columns per table. Order here is the order shown in the popover.
 * `rest` is intentionally NOT exposed everywhere — only where its content is a
 * genuinely-optional detail (staff initials / days-late) rather than load-bearing.
 */
export const TABLE_COLUMNS: Record<TableId, TableColumnSpec[]> = {
  // Unbox / History / Testing receiving-line grids (`RECEIVING_GRID_COLUMNS`).
  // `status` = the merged lifecycle track (dot · stage name, 2026-08-02).
  // `order` is frozen identity (`select · order`) — no hideKey, absent here.
  // `date` scrolls with facts (always-on, no hideKey). Platform column removed
  // from the Unbox spreadsheet SoT (2026-08-05); board-layout chips still use
  // other surfaces' platform toggles.
  //
  // `rest` no longer maps to a grid TRACK — the `stage` column that carried
  // `hideKey: 'rest'` was deleted 2026-08-02. It stays because it is still the
  /**
   * Receiving — **deliberately empty** since the wave 1.3 slot port.
   *
   * This bucket kept its hide-keys on a justification that had gone stale: the
   * comment said `ReceivingLineOrderRow` passes a `rest` cluster to
   * `RowMetaColumns`, "which asks `useIsColumnHidden('rest')`". **There is no
   * `useIsColumnHidden`** — no definition, no call site, anywhere in `src`.
   * `RowMetaColumns` is alive and reads no hide-key at all; the two facts had
   * been conflated, and the prose was defending a consumer that had already
   * been deleted. Same class of error as the surface count `band3-find-only`
   * caught, and the same fix: the empty bucket is now the claim.
   *
   * Hiding a receiving fact is unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys (the
   * `fba: []` precedent) and the kept binding parses `tableId: 'receiving'` at
   * module scope.
   */
  receiving: [],
  /**
   * Incoming POS — **deliberately empty** since the wave 1.3 slot port. The
   * separate bucket was always the point (a Fields toggle on Incoming must not
   * hide tracks on History/Unbox); it is a separate LAYOUT DOCUMENT now, which
   * is what a separate tableId buys. The KEY stays for the `TableId` union.
   */
  incoming: [],
  /**
   * Unbox pinned-Inbound embed — **deliberately empty**, same port. It stays a
   * distinct key (D13) so the embed's layout deltas persist separately from
   * `incoming`; that separation is now a separate layout document rather than a
   * separate hide-key list.
   */
  incoming_embed: [],
  /**
   * Orders + its station twins — **deliberately empty** (Wave-1 hand-model
   * kill, `docs/kill-list/07-slot-table-hand-models.md` §3). Hide-by-field-id
   * is the deleted `useGridColumnVisibility` feature living in a hashmap; on
   * the slot-materialized Orders desk "hide Pick" is "unbind `orders.picked`"
   * in the Fields + popover. The KEYS stay because `TableId`'s runtime
   * vocabulary derives from this record (the `fba: []` precedent) and the
   * kept Orders binding parses `tableId: 'orders'` at module scope.
   */
  orders: [],
  shipped: [],
  tech: [],
  testing: [],
  packer: [],
  // Grid-native: keys are the `hideKey`s in `src/lib/products/catalog-grid-layout.ts`.
  /**
   * Products catalog — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a product fact is now unbinding it from a slot. The KEY stays
   * because `TableId`'s runtime vocabulary derives from this record's keys.
   */
  catalog: [],
  /**
   * Pickup — **deliberately empty** (Wave-2 hand-model kill, kill-list 07 §4):
   * the columns are a slot materialization now, so "hide SKU" is "unbind
   * `pickup.sku`" in the Fields + popover. The KEY stays (fba/orders
   * precedent — `TableId`'s runtime vocabulary derives from this record).
   */
  pickup: [],
  // Keys are the `hideKey`s in `src/lib/repair/repair-grid-layout.ts`.
  /**
   * Repair queue — **deliberately empty** since the wave 1.4 slot port. Hiding
   * a repair fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  repair: [],
  // Keys are the `hideKey`s in
  // `src/components/warranty/grid/warranty-grid-layout.ts`. The `ticket` action
  // track is deliberately absent — it carries no `hideKey`, so it is structural
  // and the Fields menu must never offer to hide a row control.
  /**
   * Warranty claims — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a claim fact is now unbinding it from a slot; the ticket CONTROL was
   * never here (it is structural). The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys.
   */
  warranty: [],
  /**
   * Amazon Prep board — **deliberately empty**. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys. The
   * display that materialised catalog facts was torn out 2026-08-30.
   */
  fba: [],
  /**
   * Recently-tested history — **deliberately empty** since the wave 1.1 slot
   * port (`docs/todo/seller-table-program-PLAN.md` §03). Hiding a Ready fact is
   * now unbinding it from a slot, not a per-staff `hideKey` in this third
   * registry. The KEY stays because `TableId`'s runtime vocabulary derives from
   * this record's keys (the `fba: []` precedent).
   */
  ready: [],
  /**
   * Warehouse bins — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a bin fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  bins: [],
  /**
   * Inventory units — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a unit fact is now unbinding it from a slot, not a per-staff
   * `hideKey` in this third registry. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys (the `fba: []` precedent).
   */
  'inventory-units': [],
  // Keys are the `hideKey`s in
  // `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts`.
  // `select` / `order` are frozen identity and `status` is the triage state —
  // all three are structural, so none of them is offered here.
  /**
   * Home → Daily — **deliberately empty** since the wave 1.3 slot port. Hiding
   * a checklist fact is unbinding it from a slot; Team and Checked are catalog
   * facts (`daily.team`, `daily.marked`), unbound on the product layout. The
   * KEY stays for the `TableId` union.
   */
  daily: [],
  /**
   * My Tasks — **deliberately empty**, same port. Kind / Station / Resets /
   * Checked are catalog facts, bindable per organization.
   */
  tasks: [],
  /**
   * Order import staging — **deliberately empty** since the wave 1.4 slot port.
   * The separate bucket was always the point (hiding a staging column must not
   * densify live To-ship); it is now a separate LAYOUT DOCUMENT, which is what
   * a separate tableId buys. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys.
   */
  'orders-import': [],
  // Keys are the `hideKey`s in
  // `src/components/receiving/unfound/grid/unfound-grid-layout.ts`. The `action`
  // track (Push / Synced) has no `hideKey` — structural, never offered.
  /**
   * Unfound queue — **deliberately empty** since the wave 1.4 slot port. Hiding
   * a triage fact is now unbinding it from a slot; the Push CONTROL was never
   * here (it is structural). The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys.
   */
  unfound: [],
  // Keys are the `hideKey`s in `src/lib/my-day/my-day-grid-layout.ts`. `select`
  // and `task` are absent — frozen identity, structurally un-hideable. Labels
  // mirror the column SoT so the menu and the header read the same word.
  /**
   * Home · Today — **deliberately empty** since the wave 1.4 slot port, which
   * also made `fieldsMenu: true` honest here for the first time (it was
   * leftover column-display lip copy over no catalog). The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  'my-day': [],
  // Keys are the `hideKey`s in `src/lib/tech/tech-all-grid-layout.ts`. `select`
  // and `identity` are absent — frozen identity, structurally un-hideable.
  /**
   * Tech · All triage — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a triage fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  'tech-all': [],
  /**
   * Review › Catalog link — **deliberately empty** since the wave 1.3 slot
   * port. Every entry here is now a catalog fact (`catalog-link.*`) bindable
   * from the Fields menu. The KEY stays for the `TableId` union.
   */
  'catalog-link': [],
  /**
   * Review › Missing item number — **deliberately empty**, same port. Its own
   * key (rather than sharing `catalog-link`'s) is what keeps the two queues'
   * layouts independent.
   */
  'import-exception': [],
  // Keys are the `hideKey`s in
  // `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts`.
  // The `actions` track has no hideKey — structural, never offered.
  /**
   * Tracking exceptions — **deliberately empty** since the wave 1.4 slot port.
   * Hiding an exception fact is now unbinding it from a slot; the retry/edit
   * CONTROL was never here (it is structural). The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  'tracking-exceptions': [],
  // Keys are the `hideKey`s in
  // `src/components/support/zendesk/grid/support-tickets-grid-layout.ts`.
  // `select` / `subject` are absent — structurally un-hideable identity.
  'support-tickets': [
    GRID_COL('status', 'Status', 'tag'),
    GRID_COL('priority', 'Priority', 'tag'),
    GRID_COL('ticket', 'Ticket', 'id'),
    GRID_COL('updated', 'Updated', 'date'),
  ],
};

export function tableColumnsFor(tableId: TableId): TableColumnSpec[] {
  return TABLE_COLUMNS[tableId] ?? [];
}
