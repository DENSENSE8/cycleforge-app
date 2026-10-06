/** Universal-surfaces kind catalog — the single runtime SoT for every second-axis vocabulary in the universal-feed table family… */

// ─── Entity types (FIRST discriminator axis — mirrors the DB CHECKs) ──────── Must stay byte-identical with the `*_entity_type_chk` CHECK…

interface SurfaceEntityTypeDef {
  /** Parent table the id points at (delete-trigger target). */
  parentTable: string;
  /** Lowercase entity_type used when the same fact is emitted to ops_events. */
  opsEventEntityType: string;
  label: string;
  description: string;
}

export const SURFACE_ENTITY_TYPES = {
  RECEIVING: {
    parentTable: 'receiving',
    opsEventEntityType: 'receiving',
    label: 'Receiving carton',
    description: 'An inbound carton/package (receiving table): the unit of dock arrival, unboxing and triage.',
  },
  RECEIVING_LINE: {
    parentTable: 'receiving_lines',
    opsEventEntityType: 'receiving_line',
    label: 'Receiving line',
    description: 'One expected/received item line inside a carton (receiving_lines table).',
  },
  SERIAL_UNIT: {
    parentTable: 'serial_units',
    opsEventEntityType: 'serial_unit',
    label: 'Serial unit',
    description: 'One serialized physical unit (serial_units table): the thing that moves through testing, repair, listing and shipping.',
  },
  ORDER: {
    parentTable: 'orders',
    opsEventEntityType: 'order',
    label: 'Sales order',
    description: 'A marketplace sales order in the local mirror (orders table; eBay/Amazon account_source + order_id).',
  },
  FBA_SHIPMENT: {
    parentTable: 'fba_shipments',
    opsEventEntityType: 'fba_shipment',
    label: 'FBA shipment',
    description: 'An outbound Amazon FBA shipment (fba_shipments table).',
  },
  REPAIR: {
    parentTable: 'repair_service',
    opsEventEntityType: 'repair',
    label: 'Repair job',
    description: 'A repair-service job (repair_service table).',
  },
  WARRANTY_CLAIM: {
    parentTable: 'warranty_claims',
    opsEventEntityType: 'warranty_claim',
    label: 'Warranty claim',
    description: 'A customer warranty claim (warranty_claims table): logged → reviewed → approved/denied → repair/RMA.',
  },
} as const satisfies Record<string, SurfaceEntityTypeDef>;

export type SurfaceEntityType = keyof typeof SURFACE_ENTITY_TYPES;
export const SURFACE_ENTITY_TYPE_LIST = Object.keys(SURFACE_ENTITY_TYPES) as SurfaceEntityType[];

export function isSurfaceEntityType(v: unknown): v is SurfaceEntityType {
  return typeof v === 'string' && Object.hasOwn(SURFACE_ENTITY_TYPES, v);
}

// ─── feed_key (feed_memberships / staff_rail_exclusions / node_surfaces) ────

interface FeedKeyDef {
  label: string;
  /** The entity type this feed's rows anchor on. */
  entityType: SurfaceEntityType;
  description: string;
}

export const FEED_KEYS = {
  receiving_triage: {
    label: 'Arrival queue',
    entityType: 'RECEIVING',
    description: 'Cartons needing triage: unfound/no-PO, carrier mismatch, pairing not complete. Cleared when triage completes.',
  },
  receiving_unbox: {
    label: 'Unbox queue',
    entityType: 'RECEIVING',
    description: 'Received cartons waiting to be unboxed at the receiving bench.',
  },
  testing_queue: {
    label: 'Testing queue',
    entityType: 'SERIAL_UNIT',
    description: 'Serialized units waiting for (or failing) bench testing.',
  },
  orders_unshipped: {
    label: 'Unshipped orders',
    entityType: 'ORDER',
    description: 'Open sales orders not yet shipped (pick/pack/label pipeline).',
  },
  fba_outbound: {
    label: 'FBA outbound',
    entityType: 'FBA_SHIPMENT',
    description: 'FBA shipments being assembled/awaiting carrier handoff.',
  },
  repairs_queue: {
    label: 'Repairs queue',
    entityType: 'REPAIR',
    description: 'Open repair-service jobs.',
  },
  warranty_claims: {
    label: 'Warranty claims',
    entityType: 'WARRANTY_CLAIM',
    description: 'Open warranty claims in review/repair.',
  },
} as const satisfies Record<string, FeedKeyDef>;

type FeedKey = keyof typeof FEED_KEYS;
const FEED_KEY_LIST = Object.keys(FEED_KEYS) as FeedKey[];

export function isFeedKey(v: unknown): v is FeedKey {
  return typeof v === 'string' && Object.hasOwn(FEED_KEYS, v);
}

// ─── feed_memberships.state / tone (mirror the DB CHECKs) ────────────────────

// 'active'/'needs_match'/'done' are the generic membership states.
export const FEED_MEMBERSHIP_STATES = ['active', 'needs_match', 'done', 'pending', 'picked', 'blocked'] as const;
export type FeedMembershipState = (typeof FEED_MEMBERSHIP_STATES)[number];

/** Mirrors TimelineTone (src/lib/timeline/types.ts) — the house tone registry. */
export const FEED_MEMBERSHIP_TONES = ['default', 'info', 'success', 'warning', 'danger', 'muted'] as const;
type FeedMembershipTone = (typeof FEED_MEMBERSHIP_TONES)[number];

// ─── signal_kind (entity_signals) ────────────────────────────────────────────

interface SignalKindDef {
  label: string;
  /** Entity types this kind may anchor on (validation in recordEntitySignal). */
  entityTypes: readonly SurfaceEntityType[];
  /** 'internal' = chokepoint emitter (source_ref NULL); 'external' = mirror-derived (source_ref REQUIRED). */
  origin: 'internal' | 'external';
  description: string;
}

export const SIGNAL_KINDS = {
  return_reason: {
    label: 'Return reason',
    entityTypes: ['SERIAL_UNIT', 'RECEIVING_LINE'],
    origin: 'internal',
    description: 'Why a shipped unit came back — emitted when a returned serial is linked back to its outbound order (linkReturnedSerial / manual sales-order import). Free-text reason in notes; matched order context in meta.',
  },
  warranty_denial: {
    label: 'Warranty denial reason',
    entityTypes: ['WARRANTY_CLAIM'],
    origin: 'internal',
    description: 'Why a warranty claim was denied — reason_code from the governed reason_codes vocabulary (flow_context=warranty_denial).',
  },
  exception_why: {
    label: 'Receiving exception',
    entityTypes: ['RECEIVING', 'RECEIVING_LINE'],
    origin: 'internal',
    description: 'A receiving problem: carton-level NO_PO / CARRIER_MISMATCH (unfound cartons, carrier mismatches, pairing failures — entity RECEIVING) or line-level DAMAGED / SHORT / OVER / WRONG_ITEM (entity RECEIVING_LINE). reason_code = the exception code.',
  },
  triage_outcome: {
    label: 'Triage outcome',
    entityTypes: ['RECEIVING'],
    origin: 'internal',
    description: 'A carton finished triage — staging lane/shelf decision in meta. Emitted by completeTriage.',
  },
  test_fail_reason: {
    label: 'Test failure',
    entityTypes: ['SERIAL_UNIT'],
    origin: 'internal',
    description: 'A unit did not pass bench testing — meta.verdict is TESTING_FAILED (severity 2) or TEST_AGAIN (severity 1). Tech notes in notes; governed verdict-detail reason codes ride reason_code when captured.',
  },
  buyer_note: {
    label: 'Buyer note',
    entityTypes: ['ORDER'],
    origin: 'external',
    description: 'Raw buyer checkout note/message from a marketplace order, projected from the local mirror (never interpreted at ingest — semantic bucketing is a later classifier). source_ref = platform note id or content hash.',
  },
} as const satisfies Record<string, SignalKindDef>;

export type SignalKind = keyof typeof SIGNAL_KINDS;
export const SIGNAL_KIND_LIST = Object.keys(SIGNAL_KINDS) as SignalKind[];

export function isSignalKind(v: unknown): v is SignalKind {
  return typeof v === 'string' && Object.hasOwn(SIGNAL_KINDS, v);
}

// ─── node_surfaces.role ──────────────────────────────────────────────────────

export const NODE_SURFACE_ROLES = {
  inbox: { label: 'Inbox', description: 'The feed items waiting AT this node (its work queue).' },
  outbox: { label: 'Outbox', description: 'Items this node has finished and handed downstream.' },
  display: { label: 'Display', description: 'A read-only contextual feed shown at this node (no queue semantics).' },
} as const satisfies Record<string, { label: string; description: string }>;

type NodeSurfaceRole = keyof typeof NODE_SURFACE_ROLES;

function isNodeSurfaceRole(v: unknown): v is NodeSurfaceRole {
  return typeof v === 'string' && Object.hasOwn(NODE_SURFACE_ROLES, v);
}

// ─── insight_links axes ──────────────────────────────────────────────────────

export const INSIGHT_LINKAGE_TYPES = {
  industry_benchmark: { label: 'Industry benchmark', description: 'Typical values for the vertical (seeded, editable).' },
  power_user_comparison: { label: 'Power-user comparison', description: 'What top-performing operations achieve (seeded/aggregated).' },
  suggestion_seed: { label: 'Suggestion seed', description: 'A canned improvement suggestion the assistant may surface when the matching metric drifts.' },
  org_signal_rollup: { label: 'Your signal rollup', description: "This org's OWN entity_signals distribution over a trailing window (nightly cron, source='org_rollup'). Complements the seeded typicals with the operation's real reason-code breakdown." },
} as const satisfies Record<string, { label: string; description: string }>;

type InsightLinkageType = keyof typeof INSIGHT_LINKAGE_TYPES;

export const INSIGHT_SUBJECT_KINDS = ['node_type', 'feed_key', 'signal_kind'] as const;
type InsightSubjectKind = (typeof INSIGHT_SUBJECT_KINDS)[number];

function isInsightSubjectKind(v: unknown): v is InsightSubjectKind {
  return typeof v === 'string' && (INSIGHT_SUBJECT_KINDS as readonly string[]).includes(v);
}

// ─── mutation_kind + trust classes (agent_mutations) ───────────────────────── The §8 spec (plan doc "§10.

export type MutationTrustClass = 'auto' | 'draft_scoped' | 'review';

interface MutationKindDef {
  label: string;
  trust: MutationTrustClass;
  /** target_kind stamped on agent_mutation_affects rows for this kind. */
  targetKind: string;
  description: string;
  /** The permission an actor must hold to propose THIS kind — required, and deliberately not defaulted. */
  permission: string;
}

export const MUTATION_KINDS = {
  // auto — view-layer
  'staff_rail_exclusion.insert': {
    label: 'Dismiss rail item',
    trust: 'auto',
    targetKind: 'staff_rail_exclusion',
    description: 'Hide one feed item for one staff member at one station (non-destructive personal dismiss).',
    permission: 'dashboard.view',
  },
  'staff_rail_exclusion.delete': {
    label: 'Restore rail item',
    trust: 'auto',
    targetKind: 'staff_rail_exclusion',
    description: 'Undo a personal dismiss (delete the exclusion row).',
    permission: 'dashboard.view',
  },
  'feed_membership.set_state': {
    label: 'Set feed item state',
    trust: 'auto',
    targetKind: 'feed_membership',
    description: 'Flip a membership between active / needs_match / done. Projection-only; never touches the source record.',
    permission: 'operations.view',
  },
  'entity_signal.insert': {
    label: 'Record signal',
    trust: 'auto',
    targetKind: 'entity_signal',
    description: 'Append a structured "why" observation about an entity (registry-validated signal_kind).',
    permission: 'operations.view',
  },
  'node_surface.set_config': {
    label: 'Tune node surface',
    trust: 'auto',
    targetKind: 'node_surface',
    description: 'Update the config JSON of an existing node↔feed surface (sort, filters, display options).',
    permission: 'studio.manage',
  },

  // auto — receiving evidence.
  'receiving_photo.reassign': {
    label: 'Move receiving photo',
    trust: 'auto',
    targetKind: 'photo',
    description:
      "Move receiving photos to a different carton or receiving line. Payload: { photoIds: number[], targetEntityType: 'RECEIVING'|'RECEIVING_LINE', targetEntityId } for one destination, or { moves: [{ photoId, targetEntityType, targetEntityId }] } for per-photo destinations. ALL-OR-NOTHING: if any photo fails, none move. Max 50 per change. Non-destructive and revertable; the stage stamp is remapped for the destination.",
    permission: 'receiving.upload_photo',
  },

  // draft_scoped — workflow draft edits (publish is the human gate)
  'workflow_draft.add_node': {
    label: 'Add node (draft)',
    trust: 'draft_scoped',
    targetKind: 'workflow_node',
    description: 'Add a process node to the draft graph.',
    permission: 'studio.manage',
  },
  'workflow_draft.remove_node': {
    label: 'Remove node (draft)',
    trust: 'draft_scoped',
    targetKind: 'workflow_node',
    description: 'Remove a node (and its edges) from the draft graph.',
    permission: 'studio.manage',
  },
  'workflow_draft.update_node_config': {
    label: 'Update node config (draft)',
    trust: 'draft_scoped',
    targetKind: 'workflow_node',
    description: "Patch one draft node's config (station binding, rules, options).",
    permission: 'studio.manage',
  },
  'workflow_draft.add_edge': {
    label: 'Wire edge (draft)',
    trust: 'draft_scoped',
    targetKind: 'workflow_edge',
    description: 'Connect a source node port to a target node in the draft (one port → one target).',
    permission: 'studio.manage',
  },
  'workflow_draft.remove_edge': {
    label: 'Remove edge (draft)',
    trust: 'draft_scoped',
    targetKind: 'workflow_edge',
    description: 'Disconnect an edge in the draft.',
    permission: 'studio.manage',
  },
  'workflow_draft.set_annotations': {
    label: 'Set annotations (draft)',
    trust: 'draft_scoped',
    targetKind: 'workflow_definition',
    description: "Replace the draft's canvas sticky-note annotations.",
    permission: 'studio.manage',
  },
  'node_surface.create': {
    label: 'Create node surface (draft)',
    trust: 'draft_scoped',
    targetKind: 'node_surface',
    description: 'Declare a new node↔feed surface on a DRAFT definition.',
    permission: 'studio.manage',
  },
  'node_surface.delete': {
    label: 'Delete node surface (draft)',
    trust: 'draft_scoped',
    targetKind: 'node_surface',
    description: 'Remove a node↔feed surface from a DRAFT definition.',
    permission: 'studio.manage',
  },

  // review — masters / live definitions
  'staff.create': {
    label: 'Create staff member',
    trust: 'review',
    targetKind: 'staff',
    description: 'Create a real staff row (+ roles/stations). Always review-gated: touches the identity master.',
    permission: 'admin.manage_staff',
  },
  'staff.assign_station': {
    label: 'Assign staff station',
    trust: 'review',
    targetKind: 'staff',
    description: "Change a staff member's station assignments. Review-gated (identity master).",
    permission: 'admin.manage_staff',
  },
  'reason_code.create': {
    label: 'Create reason code',
    trust: 'review',
    targetKind: 'reason_code',
    description: 'Add a governed vocabulary entry (reason_codes). Review-gated: vocabularies drive validation everywhere.',
    permission: 'admin.manage_features',
  },
  'setting.update': {
    label: 'Update org setting',
    trust: 'review',
    targetKind: 'setting',
    description: 'Change a settings-registry value for the org. Review-gated: settings alter live behavior.',
    permission: 'admin.manage_features',
  },
  // review — the brand vocabulary and SKU brand facts are catalog masters
  // (sidebar Phase 1). A human approves each proposal; approval writes the
  // brand domain (src/lib/brands/brands.ts) inside the review transaction.
  'brand.create': {
    label: 'Create brand',
    trust: 'review',
    targetKind: 'product_brand',
    description:
      "Add a brand / franchise / product_line with its aliases. Payload: { name, kind?: 'brand'|'franchise'|'product_line', parentBrandId?, publisher?, aliases?: string[], assignSkuCatalogIds?: number[] }. Review-gated: the brand vocabulary classifies every search and identify call.",
    permission: 'sku_stock.manage',
  },
  'brand.update': {
    label: 'Update brand',
    trust: 'review',
    targetKind: 'product_brand',
    description:
      'Rename / re-parent / (de)activate a brand, or add and remove aliases. Payload: { brandId, name?, kind?, parentBrandId?, publisher?, isActive?, aliasesAdd?: string[], aliasesRemove?: string[] }. An alias owned by another brand is refused. Review-gated (catalog master).',
    permission: 'sku_stock.manage',
  },
  'sku_brand.assign': {
    label: 'Set SKU brand',
    trust: 'review',
    targetKind: 'sku_catalog',
    description:
      'Set (or clear with brandId: null) the brand of one catalog SKU. Payload: { skuCatalogId, brandId }. Approval stamps it as a human-confirmed fact (operator, 1.00); revertable. The brand backfill queues its below-threshold guesses here.',
    permission: 'sku_stock.manage',
  },
  // review — the paperwork a SKU prints with. The assistant proposes it with
  // link_manual_to_sku and the operator's next-turn "confirm" (or any
  // reviewer) approves it; approval re-pairs the product_manuals row.
  'product_manual.link_sku': {
    label: 'Link manual to SKU',
    trust: 'review',
    targetKind: 'product_manual',
    description:
      'Pair a product manual with a catalog SKU so it resolves (and pack-prints) for every order of that SKU. Payload: { manualId, sku, restore? }. Proposed by link_manual_to_sku — use that tool, not propose_mutation. Revertable (restores the prior pairing).',
    permission: 'product_manuals.manage',
  },
  // review — a manual (phone) order drafted in chat. The assistant proposes it
  // with create_manual_order and the operator's next-turn "yes" (or any
  // reviewer) approves it; approval writes the customer and every line
  // (caged) through the same create path as POST /api/orders/add.
  'order.create_manual': {
    label: 'Create phone order',
    trust: 'review',
    targetKind: 'order',
    description:
      'Create a manual phone order from a chat draft: customer (existing or new), every line under one order number, ship-by, parcel — held in the cage. Payload: { draft } (the manual order field contract). Proposed by create_manual_order — use that tool, not propose_mutation. Not revertable (cancel the order instead).',
    permission: 'orders.create',
  },
  // review — "this PO is for order 1125" (`link_po_to_order`): the
  // receiving_order_link edge between a purchase order and outbound orders.
  'receiving.link_order': {
    label: 'Link purchase order to order',
    trust: 'review',
    targetKind: 'receiving',
    description:
      'Link (or unlink) a purchase order to the outbound order(s) it was bought for. Payload: { op: link|unlink, po: { poNumber, inboundOrderId, receivingId }, orders: [{ orderNumber, localOrderId, channel }] }. Proposed by link_po_to_order — use that tool, not propose_mutation. Revertable (link and unlink are each other\'s inverse).',
    permission: 'receiving.scan_po',
  },
  // review — chat order-status writes (ChatWrites). Each is proposed by its
  // own tool and applied by the operator's next-turn "yes" (or any reviewer).
  'order.set_flag': {
    label: 'Set order flag',
    trust: 'review',
    targetKind: 'order',
    description:
      'Set or clear the triage flag (priority, hold, damaged, discrepancy, awaiting customer, ready) on order lines. Payload: { orderIds, flag|null, staffId } or the inverse { restore: [{ orderId, flag }] }. Proposed by set_order_flag — use that tool, not propose_mutation. Revertable (restores each prior flag).',
    permission: 'orders.create',
  },
  'order.mark_out_of_stock': {
    label: 'Mark out of stock',
    trust: 'review',
    targetKind: 'order',
    description:
      'Mark order lines out of stock (an open line shortage per line). Payload: { orderIds }. Proposed by mark_out_of_stock — use that tool, not propose_mutation. Revertable (clears the shortages it opened).',
    permission: 'orders.create',
  },
  'order.clear_out_of_stock': {
    label: 'Clear out of stock',
    trust: 'review',
    targetKind: 'order',
    description:
      'Clear every open shortage on order lines. Payload: { orderIds } or the inverse { reopenShortageIds }. Proposed by clear_out_of_stock — use that tool, not propose_mutation. Revertable (re-opens the cleared shortages).',
    permission: 'orders.create',
  },
  'order.scan_out': {
    label: 'Scan out packed orders',
    trust: 'review',
    targetKind: 'order',
    description:
      'Record packed cartons as scanned out (left the building) through the dock scan-out path. Payload: { shipments: [{ shipmentId, tracking }], staffId }. Proposed by bulk_scan_out — use that tool, not propose_mutation. Not revertable.',
    permission: 'shipping.mark_shipped',
  },
  'task.create': {
    label: 'Create task',
    trust: 'review',
    targetKind: 'work_assignment',
    description:
      'Create a task for one or more staff, optionally about an order and linked to a ticket, with a deadline and reminder. Payload: { task } or the inverse { cancelTaskId }. Proposed by create_task — use that tool, not propose_mutation. Revertable (cancels the task).',
    permission: 'work_orders.claim',
  },
  // review — SIMPLE-FIRST: turn on one org capability (its lanes appear in the
  // sidebar). Proposed by enable_capability; the operator's next-turn "yes"
  // (or any reviewer) approves it; approval writes the ledger row.
  'org.enable_capability': {
    label: 'Turn on capability',
    trust: 'review',
    targetKind: 'org_capability',
    description:
      'Turn on one org capability (its sidebar lanes and chat tools). Payload: { capabilityId, staffId } or the inverse { capabilityId, staffId, restoreState }. Proposed by enable_capability — use that tool, not propose_mutation. Revertable (restores the prior state).',
    permission: 'admin.manage_features',
  },
  'shipping.buy_label': {
    label: 'Buy shipping label',
    trust: 'review',
    targetKind: 'order',
    description:
      'Buy a ShipStation label for an order at a rate from a fresh server quote (tracking on the order, label PDF in documents, purchase ledger row). Payload built server-side by buy_label — use that tool, not propose_mutation. Not revertable (void_label voids it).',
    permission: 'shipping.buy_label',
  },
  'shipping.void_label': {
    label: 'Void shipping label',
    trust: 'review',
    targetKind: 'order',
    description:
      'Void a label bought in CycleForge (carrier refund request, tracking unlinked, label document removed). Payload built server-side by void_label — use that tool, not propose_mutation. Not revertable.',
    permission: 'shipping.void_label',
  },
} as const satisfies Record<string, MutationKindDef>;

export type MutationKind = keyof typeof MUTATION_KINDS;
export const MUTATION_KIND_LIST = Object.keys(MUTATION_KINDS) as MutationKind[];

export function isMutationKind(v: unknown): v is MutationKind {
  return typeof v === 'string' && Object.hasOwn(MUTATION_KINDS, v);
}

export function mutationTrustClass(kind: MutationKind): MutationTrustClass {
  return MUTATION_KINDS[kind].trust;
}

/** Mirrors the agent_mutations_status_chk CHECK. */
export const AGENT_MUTATION_STATUSES = ['proposed', 'under_review', 'approved', 'applied', 'rejected', 'reverted'] as const;
type AgentMutationStatus = (typeof AGENT_MUTATION_STATUSES)[number];

/** All target_kind values (agent_mutation_affects) derivable from the kinds. */
export const MUTATION_TARGET_KINDS = [...new Set(Object.values(MUTATION_KINDS).map((k) => k.targetKind))] as readonly string[];
