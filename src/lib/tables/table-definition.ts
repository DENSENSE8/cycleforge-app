/**
 * Table DEFINITION schema — the data half of a Workbench spreadsheet.
 *
 * Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md` (Phase 1, registry
 * waist). A definition is the part of a grid surface that is *configuration*:
 * which columns, in what order, at what widths, which are optional, what the
 * surface may do, and which prefs bucket it persists under. It is deliberately
 * **pure data** so it can be authored, diffed and validated — Phase 2 lets
 * Studio / an agent emit one of these as JSON.
 *
 * What is NOT in here, and must never be:
 *
 * - **Cells.** A cell is domain code (`receiving-grid/cells/*`), per family,
 *   forever at this horizon. A definition names a {@link cellMapKey}; it does
 *   not carry JSX.
 * - **Descriptor options.** `isSortable` / `isLocked` / `sortDescFirst` /
 *   accessors are functions, so they stay in the family's `make*Descriptor`.
 * - **Schema.** A definition selects among columns a family already renders; it
 *   never mints a DB column. DDL is not a display concern.
 *
 * The pairing of a definition with its typed column model + descriptor factory
 * is a `TableSurfaceBinding` (`@/components/tables/table-surface-binding`).
 *
 * ## Why the refinements below are laws, not taste
 *
 * `superRefine` carries the structural rules an author (human or model) can
 * otherwise break silently, because each of them fails as a *layout* bug rather
 * than an error:
 *
 * - a frozen pane that is not a contiguous leading prefix pins at the wrong
 *   origin (`gridFrozenLeft` sums the widths of the frozen columns *before* a
 *   given one);
 * - a frozen column carrying `hideKey`/`tier` can have the row's identity taken
 *   away by the column-display rail;
 * - two flex tracks means neither absorbs the sheet's slack predictably;
 * - and a default set that keeps growing is how a dense 1080p ops queue turns
 *   into soup one "just one more column" at a time.
 *
 * Invariants mirror Grid identity pane ·
 * Grid column visibility + sort.
 */

import { z } from 'zod';
import { TABLE_COLUMNS, type ColumnType, type TableId } from '@/lib/tables/table-columns';

/**
 * Column `type` vocabulary, as a runtime tuple.
 *
 * `ColumnType` is a type-only union, so the tuple is hand-written and then
 * pinned to it in both directions: `satisfies` catches a value that is not a
 * `ColumnType`, and {@link MissingColumnType} fails the build when a new member
 * is added to the union and forgotten here.
 */
const COLUMN_TYPE_VALUES = [
  'text',
  'number',
  'id',
  'tag',
  'longtext',
  'date',
  'external',
  'location',
  'tracking',
  'price',
  'image',
] as const satisfies readonly ColumnType[];

type MissingColumnType = Exclude<ColumnType, (typeof COLUMN_TYPE_VALUES)[number]>;
// Compile-time exhaustiveness: a new ColumnType with no tuple entry breaks here.
const _COLUMN_TYPES_EXHAUSTIVE: MissingColumnType[] = [];
void _COLUMN_TYPES_EXHAUSTIVE;

/** Typed date faces — drives the track floor (`MIN_TRACK_REM_BY_DATE_FACE`). */
const DATE_COLUMN_FACE_VALUES = ['day', 'stamp', 'duration'] as const;

/**
 * Prefs-bucket ids, derived from the existing registry rather than re-typed.
 *
 * `TableId` is a type-only union; `TABLE_COLUMNS` is its `Record`, so its keys
 * ARE the runtime vocabulary. Deriving means a new table id cannot be legal in
 * one place and unknown in the other.
 */
const TABLE_ID_VALUES = Object.keys(TABLE_COLUMNS) as [TableId, ...TableId[]];

/**
 * Entity families a definition may bind to. One family = one typed row shape +
 * one cell map; this is the key `cellMapKey` resolves against, and it matches
 * the surface names in `grid-surface-capabilities.guard.test.ts`.
 */
const TABLE_ENTITY_FAMILIES = [
  'receiving',
  'incoming',
  'orders',
  /** To-Ship CSV import staging — parsed rows + triage state, not live orders. */
  'orders-import',
  'catalog',
  'repair',
  'pickup',
  'warranty',
  'ready',
  'tracking-exceptions',
  'unfound',
  'bins',
  /**
   * Inventory › Ledger activity feed. Its own family, never `inventory-units`:
   * a unit is a THING and an event is something that HAPPENED to one, so the
   * two share neither a row shape nor a prefs bucket.
   */
  'inventory-events',
  'my-day',
  'tech-all',
  // Home → Daily shift checklist.
  'daily',
  /** Home → Tasks: one staffer's own `staff_todos`. A SIBLING of `daily`, not
   *  a view of it — different store, different question, different row shape. */
  'tasks',
  'catalog-link',
  /**
   * Review → Missing item number. Sibling of `catalog-link`, never a merge:
   * different store (`order_import_exceptions` vs `order_catalog_link_chores`)
   * and a different question (sheet row never became an order vs listing
   * unmatched to a catalog SKU).
   */
  'import-exception',
  'station-history',
  /**
   * Tech bench history — one row = one test scan, shaped into the shared
   * `QueueRowRecord` by `techRecordToQueueRow`. Catalog:
   * field-catalog/tech.ts. A SIBLING of `packer`, never a merge: the two
   * benches answer different questions and carry different stamps.
   */
  'tech',
  /** Packer bench history — `packerRecordToQueueRow` rows; catalog in field-catalog/packer.ts. */
  'packer',
  'fba',
  'units',
  /** Settings › Kiosk devices — enrolled tablets; catalog in field-catalog/kiosk-devices.ts. */
  'kiosk-devices',
  /**
   * Settings › Kiosk slot history — one row = one lane state transition.
   * Filter/export only; never Revoke (credential verb stays on kiosk-devices).
   * Catalog: field-catalog/kiosk-slot-events.ts.
   */
  'kiosk-slot-events',
  /**
   * Dashboard › Sales completed visits. Catalog: field-catalog/walk-in-sales.ts.
   * KEEP — family union so the field catalog typechecks; not a feed engine.
   */
  'walk-in-sales',
  /**
   * Settings › Active staff sessions — one row = one live `staff_sessions`
   * row. Catalog: field-catalog/auth-sessions.ts. Revoke is a row verb, never
   * an actions column.
   */
  'auth-sessions',
  /** Admin › Cycle count campaigns — one row = one campaign; catalog in field-catalog/cycle-counts.ts. */
  'cycle-counts',
  /**
   * Admin › Returns dock — one row = one RETURNED inventory_event. A SIBLING
   * of `inventory-events`, never a merge: its own prefs bucket, the Ledger's
   * cells. Catalog: field-catalog/admin-returns.ts.
   */
  'admin-returns',
  /**
   * Admin › Sourcing compatibility — one row = one model ↔ part edge.
   * Catalog: field-catalog/part-compatibility.ts. Remove is a row verb behind
   * a confirm plane, never an actions column.
   */
  'part-compatibility',
  /**
   * Unit detail › Order allocations — one row = one `order_unit_allocations`
   * reservation. ONE family for both ends of the entity. Catalog:
   * field-catalog/unit-allocations.ts.
   */
  'unit-allocations',
  /**
   * Unit detail › v1 `tech_serial_numbers` cross-refs — one row = one legacy
   * tech-station serial record. Read-only. Catalog:
   * field-catalog/unit-tsn-links.ts.
   */
  'unit-tsn-links',
  /**
   * Settings › Audit log — one row = one `audit_logs` row. Read-only: no row
   * verbs and no record plane (the before/after diff was never built).
   * Catalog: field-catalog/audit-log.ts.
   */
  'audit-log',
  /**
   * Admin › Inventory holds — one row = one `serial_units` row in ON_HOLD,
   * joined to the HELD event that quarantined it. Catalog:
   * field-catalog/admin-holds.ts. Release is a row verb that OPENS A PLANE
   * (its payload takes a restore-status parameter), never a `<form>` in a cell.
   */
  'admin-holds',
  /**
   * Admin › Bulk allocate — one row = one unallocated `orders` row beside its
   * SKU's STOCKED count. Catalog: field-catalog/admin-bulk-allocate.ts.
   * Allocate is a row verb, never an actions column; `qty` and `eligible` are
   * DERIVED in the resolver, so neither carries a `paths` entry.
   */
  'admin-bulk-allocate',
  /**
   * Admin › Cycle count LINES — one row = one `cycle_count_lines` row of one
   * campaign. Catalog: field-catalog/cycle-count-lines.ts. Count / Approve /
   * Reject are row verbs (the count opens a stage-overlay plane, because a
   * parameterised write has no home on a compound row); never an actions column.
   */
  'cycle-count-lines',
  /**
   * Admin › Inventory open DRIFT alerts — one row = one unresolved
   * `stock_alerts` DRIFT row. Read-only: `/api/cron/inventory/drift-check`
   * opens and resolves them, so a row verb here would be a second writer into
   * a table the cron owns. Catalog: field-catalog/admin-drift-alerts.ts.
   */
  'admin-drift-alerts',
  /**
   * Admin › Inventory sku_stock ↔ ledger drift — one row = one
   * `v_sku_stock_drift` comparison. A read-time join: no id and no timestamp,
   * so the SKU is the identity and the Dates chrome carries no fact.
   * Read-only. Catalog: field-catalog/admin-sku-drift.ts.
   */
  'admin-sku-drift',
  /**
   * Settings › Team directory — one row = one `staff` row. Catalog:
   * field-catalog/staff-directory.ts. The sign-in-policy write and Deactivate
   * are row verbs behind stage-overlay planes, never cells; the retired desk
   * had both as controls inside a cell.
   */
  'staff-directory',
  /**
   * Reports › Bin utilization — one row = one `mv_bin_utilization` bin,
   * org-scoped by the route's `locations` join. Read-only: no row verbs and no
   * record plane. Catalog: field-catalog/report-bin-utilization.ts. NOT
   * `bins` — that family's row carries count stamps and flags this MV
   * projection does not have.
   */
  'report-bin-utilization',
  /**
   * Reports › SKU velocity (30d) — one row = one SKU's movement totals,
   * recomputed from the org-bearing base tables. Read-only. Catalog:
   * field-catalog/report-velocity.ts.
   */
  'report-velocity',
  /**
   * Reports › Dead stock (90d+) — one row = one dormant SKU. A SIBLING of
   * `report-velocity`, never a merge: two windows, two questions, different
   * facts. Catalog: field-catalog/report-dead-stock.ts.
   */
  'report-dead-stock',
  /**
   * Reports › Staff day — one row = one (staffer × task) cell of one day's
   * daily-check report. Read-only ("view only in a manager", operator
   * 2026-09-15): no row verbs, no record plane — the interactive per-person
   * view is /m/reports over the same `buildStaffDay` projection. Catalog:
   * field-catalog/report-staff-day.ts.
   */
  'report-staff-day',
  /**
   * Reports › Packer day — one row = one PACK scan of one PST day
   * (`station_activity_logs` + its `packer_log_enrichment`). Read-only: the
   * editable thing is the SKU's time to pack, which lives on the product
   * record the row title links to. Replaced the hand-rolled `<table>` on
   * `/operations?mode=analytics`, retired 2026-09-16 because the operator
   * could not trust a KPI strip whose deltas compared a partial day with a
   * whole one. Catalog: field-catalog/report-packer-day.ts.
   */
  'report-packer-day',
  /**
   * Admin › per-SKU bin distribution — one row = one location holding this
   * SKU. Read-only. Catalog: field-catalog/sku-bins.ts. NOT `bins` — that
   * family's row is the warehouse-wide bin with its own count stamps and
   * flags; this one is a per-SKU quantity in a location.
   */
  'sku-bins',
  /**
   * Admin › per-SKU stock ledger — one row = one `sku_stock_ledger` write.
   * Read-only. Catalog: field-catalog/sku-ledger.ts. The retired `refs` cell
   * packed three reference ids into one string; they are three facts here.
   */
  'sku-ledger',
  /**
   * Inventory › Stock — one row = one `(location, sku)` pair holding stock,
   * warehouse-wide. Read-only. Catalog: field-catalog/location-stock.ts.
   * Neither of its two neighbours: `bins` rows a LOCATION with aggregates over
   * every SKU inside it, and `sku-bins` rows the pairs of ONE SKU on a page
   * that already names it. This family spans the floor, so `room` is a fact it
   * filters and sorts by and `product_title` is a real join.
   */
  'location-stock',
  /**
   * `/search` find plane — one row = one cross-entity search HIT. Read-only.
   * Catalog: field-catalog/search-hits.ts. ONE family over six entity types
   * on purpose: the row shape is the search wire (`AiSearchHit`), and six
   * registrations of one dataset is the fork `REGISTER_ENTITY_NOT_PAGE`
   * names. Heterogeneity is resolved at the adapter.
   */
  'search-hits',
] as const;

/**
 * Warehouse-dense default ceiling: how many non-gutter tracks a grid may open
 * with before the rest must be `tier: 'optional'` and opted in from the
 * column-display rail.
 *
 * Ten, because the golden (Receiving) opens with eight and the surfaces are
 * built for a 1080p bench beside a locked 720px station centre — there is real
 * headroom, and a definition asking for twelve default tracks is asking the
 * operator to scroll horizontally to read a row.
 */
export const MAX_DEFAULT_VISIBLE_TRACKS = 10;

/** The house select gutter — structural, and never counted against the ceiling. */
const SELECT_GUTTER_KEY = 'select';

/**
 * One column of a definition — the pure-data mirror of `LedgerGridColumnModel`
 * plus the `sortable` header flag the receiving family declares.
 *
 * Strict on purpose: an unknown key is a rejected definition, not a silently
 * ignored one. That is the whole guarantee that makes authoring these safe.
 */
export const tableDefinitionColumnSchema = z.strictObject({
  key: z.string().min(1),
  /** CSS grid track (`minmax(X, X)`; at most one `1fr` per surface). */
  width: z.string().min(1),
  label: z.string().min(1).optional(),
  /**
   * Header word for the GRID face. `''` is legal and load-bearing — it is not a
   * blank that slipped through.
   *
   * The compound chrome tracks `select` and `_fill` declare `gridLabel: ''` on
   * purpose: they are a 48px checkmark square and a slack track, and
   * `COMPOUND_TRACKS` documents each one. `thumb` is the exception — it keeps
   * the word `Image` via `headerForceLabel`. So `''` means *print nothing
   * here*, which is a different instruction from `undefined` (*not specified —
   * fall back to `label`*). A `.min(1)` here rejected the empty string and
   * took the whole Orders desk down with a Zod throw at module load, because
   * select (the first column of every compound table) still carries it.
   *
   * If blank-label authoring ever needs policing, the rule is "`label` must not
   * be blank" — which the line above already enforces — not this one.
   */
  gridLabel: z.string().optional(),
  labelFitRem: z.number().positive().optional(),
  headerGlyphOnly: z.boolean().optional(),
  /** Always paint the header word, even in a track narrower than the fit floor. */
  headerForceLabel: z.boolean().optional(),
  type: z.enum(COLUMN_TYPE_VALUES).optional(),
  dateFace: z.enum(DATE_COLUMN_FACE_VALUES).optional(),
  minTrackRem: z.number().positive().optional(),
  align: z.enum(['start', 'end', 'center']).optional(),
  resizable: z.boolean().optional(),
  omitCellIcon: z.boolean().optional(),
  frozen: z.boolean().optional(),
  /** Staff-prefs key. Absent ⇒ structural / un-hideable. */
  hideKey: z.string().min(1).optional(),
  tier: z.enum(['core', 'optional']).optional(),
  /** Header is click-to-sort. The runtime vocabulary stays the family's code. */
  sortable: z.boolean().optional(),
  // ── Materialized slot-track metadata (`materializeTracks`) ────────────────
  // A definition whose canonical columns are a SlotLayout materialization
  // (Orders since the Wave-1 hand-model kill) carries these on its slot
  // tracks. Optional everywhere else; strictness still rejects unknown keys.
  /** Catalog field bound into this slot track (`status:N`); key stays the slot. */
  fieldId: z.string().min(1).optional(),
  /** Glyph key for `stage_event` slot cells, copied from the field. */
  slotIconKey: z.string().min(1).optional(),
  /** The bound field's display type — slot cells branch on this, never on id. */
  slotDisplayType: z
    .enum(['stage_event', 'tag', 'date', 'person', 'number', 'money', 'note', 'tracking', 'id', 'text'])
    .optional(),
  /** `stage_event` verb faces, copied from the field. */
  slotStageLabels: z.strictObject({ done: z.string().min(1), pending: z.string().min(1) }).optional(),
});

export type TableDefinitionColumn = z.infer<typeof tableDefinitionColumnSchema>;

/** All five flags explicit — "undefined means on" is the bug this prevents. */
const tableDefinitionCapabilitiesSchema = z.strictObject({
  rowTriageFlags: z.boolean(),
  multiSelect: z.boolean(),
  inCellEdit: z.boolean(),
  fieldsMenu: z.boolean(),
  dayBands: z.boolean(),
});

const tableDefinitionShape = z.strictObject({
  /** `<family>.<view>` — e.g. `receiving.browse`. */
  id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, 'id must be "<family>.<view>"'),
  tableId: z.enum(TABLE_ID_VALUES),
  entityFamily: z.enum(TABLE_ENTITY_FAMILIES),
  /** Which per-family cell map renders this definition's rows. */
  cellMapKey: z.enum(TABLE_ENTITY_FAMILIES),
  /** Accessible name for the table — name the collection, not the page. */
  ariaLabel: z.string().min(1),
  /** Outer shell testid; the scroll body gets `${testId}-scroll`. */
  testId: z.string().min(1),
  /** `sheet` = flush Sheets plane (the Workbench recipe); `framed` = raised card. */
  surface: z.enum(['framed', 'sheet']),
  /** Sticky day bands. Auto-suppressed under a column sort. */
  showDayHeaders: z.boolean(),
  capabilities: tableDefinitionCapabilitiesSchema,
  columns: z.array(tableDefinitionColumnSchema).min(1),
});

export const tableDefinitionSchema = tableDefinitionShape.superRefine((def, ctx) => {
  const fail = (message: string, path: (string | number)[] = ['columns']) =>
    ctx.addIssue({ code: 'custom', message, path });

  const keys = def.columns.map((c) => c.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) fail(`duplicate column keys: ${[...new Set(dupes)].join(', ')}`);

  // Frozen identity pane: a contiguous LEADING prefix. Sticky-left offsets sum
  // the widths of the frozen columns before a given one, so a frozen column
  // sitting after a scrolling one pins at the wrong origin.
  const frozenAt = def.columns.map((c, i) => (c.frozen ? i : -1)).filter((i) => i >= 0);
  if (frozenAt.length > 0) {
    const contiguousPrefix = frozenAt.every((index, i) => index === i);
    if (!contiguousPrefix) fail('frozen columns must be a contiguous leading prefix');
    for (const index of frozenAt) {
      const col = def.columns[index];
      if (col.hideKey || col.tier) {
        fail(
          `frozen column '${col.key}' is structural — it may not carry hideKey or tier`,
          ['columns', index],
        );
      }
    }
  }

  // At most one flex track: it is the surface's slack absorber, and two of them
  // means neither absorbs predictably under a drag-resize.
  const flex = def.columns.filter((c) => c.width.includes('1fr'));
  if (flex.length > 1) {
    fail(`at most one flex (1fr) track; got ${flex.map((c) => c.key).join(', ')}`);
  }

  for (const [index, col] of def.columns.entries()) {
    if (col.dateFace && col.type !== 'date') {
      fail(`dateFace is only meaningful on type: 'date' (column '${col.key}')`, ['columns', index]);
    }
  }

  const defaultVisible = defaultVisibleTrackKeys(def.columns);
  if (defaultVisible.length > MAX_DEFAULT_VISIBLE_TRACKS) {
    fail(
      `${defaultVisible.length} default-visible tracks exceeds the dense ceiling of ` +
        `${MAX_DEFAULT_VISIBLE_TRACKS}. Mark the secondary ones tier: 'optional' and let ` +
        `staff add them from the column-display rail: ${defaultVisible.join(', ')}`,
    );
  }
});

export type TableDefinition = z.infer<typeof tableDefinitionShape>;

/**
 * Tracks a staffer sees before touching the column-display rail — every
 * non-`optional` column except the structural select gutter.
 */
export function defaultVisibleTrackKeys(columns: readonly TableDefinitionColumn[]): string[] {
  return columns
    .filter((c) => c.tier !== 'optional' && c.key !== SELECT_GUTTER_KEY)
    .map((c) => c.key);
}

/**
 * Validate a definition payload. Throws on the first structural violation —
 * a definition is loaded at module scope, so a bad one must fail the build,
 * not paint a broken grid.
 */
export function parseTableDefinition(input: unknown): TableDefinition {
  return tableDefinitionSchema.parse(input);
}
