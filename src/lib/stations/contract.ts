/**
 * Station builder — core contract (Operations Studio layer 2).
 *
 * DATA SOURCES and ACTIONS: typed descriptors over routes that already exist,
 * so an integration ships a feed and a verb without owning a query path or a
 * mutation. Everything here is CODE — registered, typed, PR-reviewed.
 *
 * The BLOCK half of this contract (BlockDefinition · BlockProps · BlockRole ·
 * ConfigField · BoundAction) was deleted 2026-08-22 with the slot renderer:
 * slots carried no geometry, so they could never express a tile layout, and the
 * renderer was flag-gated off in every deployment. What survives of that half is
 * the SHAPE of the `station_definitions.config` JSON already in tenant rows —
 * kept honest below because those rows still exist, not because anything renders
 * from them. The one field live code reads off a definition row is
 * `workflowNodeId` (see `surface-workflow-node.ts`).
 */

// ─── Slots ───────────────────────────────────────────────────
//
// The named regions of a station chassis a block can occupy. The builder
// enforces compatibility; a block declares which slots it may be dropped into.

export const SLOT_IDS = ['trigger', 'queue', 'workspace', 'advance', 'header'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

// ─── Field kinds ─────────────────────────────────────────────
//
// Semantic kinds are what make binding smart: a `po_ref` field auto-selects
// the PO renderer and makes PO-scoped actions offerable. Renderers for these
// kinds MUST delegate to the existing label SoTs (conditions.ts,
// source-platform.ts, copy-chip-format.ts) — never a second inline map.

export const FIELD_KINDS = [
  'po_ref',
  'tracking_ref',
  'order_ref',
  'sku_ref',
  'serial_ref',
  'condition_grade',
  'source_platform',
  'timestamp',
  'money',
  'text',
  'staff_ref',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
}

/** A user-tunable knob the Config Sheet's Source tab renders. */
export interface FilterDef {
  key: string;
  label: string;
  kind: 'boolean' | 'select' | 'text';
  options?: Array<{ value: string; label: string }>;
  default?: unknown;
}

/** One row a data source resolves. `id` must be stable (action targets). */
export interface SourceRow {
  id: string;
  [key: string]: unknown;
}

// ─── Table lineage ───────────────────────────────────────────
//
// The persistent relations an endpoint touches — BPMN's "data store" grain
// (persistent, shared across processes), as opposed to the transient row/payload
// a block renders (BPMN's "data object"). Table-level only, deliberately: it is
// the granularity the industry ships (dbt's native lineage is table-level;
// OpenLineage keeps column lineage an OPTIONAL facet), and it is the granularity
// `data-lineage.guard.test.ts` can actually verify by matching the name against
// the module's SQL. A column-level claim would need a real SQL parser, and a
// parser that fails open produces the untrusted map that is worse than no map.

export interface TableRef {
  /** Physical relation name, exactly as it appears in migrations and in SQL. */
  table: string;
  /**
   * The module whose SQL touches it, when that is NOT the descriptor's own
   * endpoint route (`@/lib/receiving/serial-attach`). The guard verifies the
   * named module really touches the named table, so a `via` can never be a
   * guess — it is a checked claim about where the write lives.
   */
  via?: string;
}

// ─── Data sources ────────────────────────────────────────────

export interface DataSourceDefinition {
  /** Registry key, e.g. 'po_gmail.unmatched_emails'. */
  id: string;
  label: string;
  /** Owning integration, e.g. 'po-gmail' | 'zoho' | 'receiving'. */
  integration: string;
  /**
   * The EXISTING GET route this source wraps — sources never own a query
   * path. `buildUrl` appends the filter knobs the route already understands.
   */
  endpoint: string;
  buildUrl: (filters: Record<string, unknown>) => string;
  /**
   * Adapt the route's response into rows. Filters the endpoint can't apply
   * server-side may be applied here (still code — config can only pick among
   * declared FilterDefs, never inject logic).
   */
  parse: (json: unknown, filters: Record<string, unknown>) => SourceRow[];
  /** Declared row shape; field kinds drive renderers + action matching. */
  shape: FieldDef[];
  filters?: FilterDef[];
  /** Permission the wrapped GET is gated on — blocks bound to this source render only for holders. */
  permission: string;
  /** Live invalidation channel, when the feed has one. */
  realtime?: { ablyChannel?: string };
  /**
   * Relations `endpoint` reads. Optional so lineage is adoptable per station,
   * but NOT optional once declared: `data-lineage.guard.test.ts` fails when the
   * route's own SQL touches a relation this list omits, and when this list names
   * one the SQL never touches. Ids in `LINEAGE_REQUIRED` must declare.
   */
  reads?: TableRef[];
  /** Relations `endpoint` writes. A GET feed normally declares none. */
  writes?: TableRef[];
}

/** Palette/config-sheet metadata (no functions) — safe to serialize. */
export type DataSourceMeta = Omit<DataSourceDefinition, 'parse' | 'buildUrl'>;

// ─── Actions ─────────────────────────────────────────────────

export interface ActionDefinition {
  /** Registry key, e.g. 'incoming.dismiss_email'. */
  id: string;
  label: string;
  /** lucide icon name (resolved client-side). */
  icon: string;
  /**
   * The EXISTING mutation route this action wraps — descriptors only, the
   * route already owns validation, auth, idempotency, audit. `:id` in the
   * path is replaced with the target row's id.
   */
  endpoint: { method: 'POST' | 'PATCH' | 'DELETE'; path: string };
  /** Request body built from the target row (static for most actions). */
  body?: (row: SourceRow) => unknown;
  /** Existing permission-registry key gating the wrapped route. */
  permission: string;
  /** Offered when the bound source has a field of one of these kinds… */
  appliesTo: FieldKind[];
  /** …or when it belongs to the same integration. */
  integration?: string;
  confirm?: 'none' | 'soft' | 'step_up';
  /** Relations `endpoint` reads — same contract as `DataSourceDefinition.reads`. */
  reads?: TableRef[];
  /** Relations `endpoint` writes — the half that makes an action's blast radius legible. */
  writes?: TableRef[];
}

export type ActionMeta = Omit<ActionDefinition, 'body'>;

// ─── Station config (the DATA stored in station_definitions.config) ──────────

export interface BlockInstanceConfig {
  /** Stable instance id, e.g. 'blk_8f2'. */
  id: string;
  /** Block registry key. */
  block: string;
  source?: {
    id: string;
    filters?: Record<string, unknown>;
    /** role key → source field key. */
    fields?: Record<string, string>;
  };
  display?: Record<string, unknown>;
  /** Action registry keys this instance exposes. */
  actions?: string[];
  /** Action id that checks an item off (null/absent = manual tick only). */
  done_when?: string | null;
}

/**
 * The persisted shape of `station_definitions.config`. Both arms occur in live
 * tenant rows (`'legacy'` was the hard-coded-tree escape hatch), but nothing
 * renders from either since the slot renderer was deleted — this type exists so
 * the column is still typed where it is read back.
 */
export interface StationConfig {
  slots: Partial<Record<SlotId, BlockInstanceConfig[]>> | 'legacy';
}

export interface StationDefinitionRow {
  id: number;
  pageKey: string;
  modeKey: string;
  label: string;
  workflowNodeId: string | null;
  config: StationConfig;
  version: number;
  isActive: boolean;
  updatedBy: number | null;
  updatedAt: string;
}
