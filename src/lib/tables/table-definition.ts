/** Table DEFINITION schema — the data half of a Workbench spreadsheet. */

import { z } from 'zod';
import { TABLE_COLUMNS, type ColumnType, type TableId } from '@/lib/tables/table-columns';

/** Column `type` vocabulary, as a runtime tuple. */
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

/** Prefs-bucket ids, derived from the existing registry rather than re-typed. */
const TABLE_ID_VALUES = Object.keys(TABLE_COLUMNS) as [TableId, ...TableId[]];

/**
 * Entity families a definition may bind to. One family = one typed row shape +
 * one cell map; this is the key `cellMapKey` resolves against, and it matches
 * the surface names in `grid-surface-capabilities.guard.test.ts`.
 */
const TABLE_ENTITY_FAMILIES = [
  'receiving',
  'orders',
  /** Repair service ticket — warehouse queue and bench record. */
  'repair',
  /** To-Ship CSV import staging — parsed rows + triage state, not live orders. */
  'orders-import',
  /** Search › Pasted list — one row = one pasted identifier and where it lives (the bar's held list, full screen). */
  'pasted-list',
  /** Support › Support items — one row = one local Support item (`/support`). */
  'support',
  'catalog',
  'pickup',
  'warranty',
  'ready',
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
  /** Review → Missing item number. */
  'import-exception',
  'station-history',
  /** Tech bench history — one row = one test scan, shaped into the shared `QueueRowRecord` by `techRecordToQueueRow`. */
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
  /** Admin › Inventory holds — one row = one `serial_units` row in ON_HOLD, joined to the HELD event that quarantined it. */
  'admin-holds',
  /** Admin › Bulk allocate — one row = one unallocated `orders` row beside its SKU's STOCKED count. */
  'admin-bulk-allocate',
  /** Admin › Cycle count LINES — one row = one `cycle_count_lines` row of one campaign. */
  'cycle-count-lines',
  /** Admin › Inventory open DRIFT alerts — one row = one unresolved `stock_alerts` DRIFT row. */
  'admin-drift-alerts',
  /** Admin › Inventory sku_stock ↔ ledger drift — one row = one `v_sku_stock_drift` comparison. */
  'admin-sku-drift',
  /** Settings › Team directory — one row = one `staff` row. */
  'staff-directory',
  /** Reports › Bin utilization — one row = one `mv_bin_utilization` bin, org-scoped by the route's `locations` join. */
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
  /** Reports › Staff day — one row = one (staffer × task) cell of one day's daily-check report. */
  'report-staff-day',
  /** Reports › Packer day — one row = one PACK scan of one PST day (`station_activity_logs` + its `packer_log_enrichment`). */
  'report-packer-day',
  /** Reports › Tasks — one row = one FINISHED `work_assignments` follow-up (`work_type = 'FOLLOW_UP'`, lane `done`). */
  'report-tasks',
  /** Admin › per-SKU bin distribution — one row = one location holding this SKU. */
  'sku-bins',
  /**
   * Admin › per-SKU stock ledger — one row = one `sku_stock_ledger` write.
   * Read-only. Catalog: field-catalog/sku-ledger.ts. The retired `refs` cell
   * packed three reference ids into one string; they are three facts here.
   */
  'sku-ledger',
  /** `/search` find plane — one row = one cross-entity search HIT. */
  'search-hits',
] as const;

/** Warehouse-dense default ceiling: */
export const MAX_DEFAULT_VISIBLE_TRACKS = 10;

/** The house select gutter — structural, and never counted against the ceiling. */
const SELECT_GUTTER_KEY = 'select';

/** One column of a definition — the pure-data mirror of `LedgerGridColumnModel` plus the `sortable` header flag the receiving family declares. */
export const tableDefinitionColumnSchema = z.strictObject({
  key: z.string().min(1),
  /** CSS grid track (`minmax(X, X)`; at most one `1fr` per surface). */
  width: z.string().min(1),
  label: z.string().min(1).optional(),
  /** Header word for the GRID face. */
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
  // ── Materialized data-track metadata (`materializeTracks`) ──────────────── A definition whose canonical columns come from a DataTableColumnLayout.
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
