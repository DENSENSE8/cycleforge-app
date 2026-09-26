/** Procedure registry — the ORDERED step sequence an operator performs at a surface, and the data each step touches (Operations Studio,… */

import { ASPECTS_BY_STAGE, type PhotoAspect } from '@/lib/photos/photo-aspects';
import type { TableRef } from './contract';
import type { SurfaceKey } from './surface-keys';
import { applyCaptureOrderOverride } from './unbox-flow-capture-order';

/** Which part of the station's work a step belongs to. */
export type ProcedurePhase = 'intake' | 'capture' | 'commit';

/**
 * Named Unbox capture trees. Mutually exclusive — selected by intake / pairing,
 * never composed as co-occurring flags.
 */
export type UnboxFlowId = 'found' | 'unfound' | 'return';

/** Operator-voiced label for checklist / receipt chrome. */
export const UNBOX_FLOW_LABEL: Record<UnboxFlowId, string> = {
  found: 'Found unbox',
  unfound: 'Unfound unbox',
  return: 'Return unbox',
};

/** Controlled variation inside a named flow — not a fourth SOP. */
export interface ProcedureModifiers {
  isLocalPickup?: boolean;
  needsClassify?: boolean;
  /**
   * Org (or caller) preferred capture key order for this flow. Applied after
   * needsClassify / isLocalPickup — cannot invent keys outside the allowed set.
   */
  captureOrderOverride?: readonly string[];
}

/** What `resolveProcedureSteps` needs to pick an ordered step list. */
export interface ProcedureResolveContext {
  flow: UnboxFlowId;
  modifiers?: ProcedureModifiers;
}

/**
 * Intake flags used to select a flow. Pure — callers derive these from the row
 * (`isReturnIntake`, `!zoho_purchaseorder_id`, `isLocalPickupFulfillment`).
 */
interface UnboxFlowFlags {
  isUnfound: boolean;
  isReturn: boolean;
  isLocalPickup?: boolean;
}

/**
 * Precedence: return → unfound → found.
 * Local pickup never wins a flow id; it is only a modifier.
 */
export function resolveUnboxFlow(flags: Pick<UnboxFlowFlags, 'isUnfound' | 'isReturn'>): UnboxFlowId {
  if (flags.isReturn) return 'return';
  if (flags.isUnfound) return 'unfound';
  return 'found';
}

/** Flags → resolve context (bench, receipt, tests). */
export function resolveContextFromFlags(flags: UnboxFlowFlags): ProcedureResolveContext {
  const flow = resolveUnboxFlow(flags);
  return {
    flow,
    modifiers: {
      isLocalPickup: !!flags.isLocalPickup,
      needsClassify: flow === 'return' && flags.isUnfound,
    },
  };
}

/**
 * @deprecated Prefer {@link ProcedureResolveContext}. Kept as a thin shape for
 * call sites that still speak in the old three-boolean vocabulary — maps through
 * {@link resolveContextFromFlags}.
 */
export interface ProcedureVariant {
  isUnfound?: boolean;
  isLocalPickup?: boolean;
  isReturn?: boolean;
}

/** @deprecated Use {@link resolveContextFromFlags}. */
function variantToResolveContext(variant: ProcedureVariant = {}): ProcedureResolveContext {
  return resolveContextFromFlags({
    isUnfound: !!variant.isUnfound,
    isReturn: !!variant.isReturn,
    isLocalPickup: !!variant.isLocalPickup,
  });
}

/**
 * A single ordered act at the bench. `key` is stable and is what both Studio
 * and the station checklist paint.
 */
export interface ProcedureStep {
  /** Stable within its procedure, e.g. `serial`. */
  key: string;
  label: string;
  /** One line, operator-voiced: what the person does here. */
  summary: string;
  /** Which surface renders it — see {@link ProcedurePhase}. */
  phase: ProcedurePhase;
  /** Repeats per unit on a multi-quantity line, so the row carries `n of N`. */
  perUnit?: boolean;
  /** Receiving photo stage this step is evidenced by, when it is a photo step. */
  photoStage?: 'arrival_package' | 'unbox_carton' | 'unbox_item';
  /** Photo ASPECT this step is evidenced by, when its evidence is one specific shot (`@/lib/photos/photo-aspects`). */
  photoAspect?: PhotoAspect;
  /** The step is evidenced by a SET of aspects, each of which is its own sub-row (`item_photos`). */
  photoAspectSet?: readonly PhotoAspect[];
  /**
   * True when the station registry drives this step (a composed block bound to
   * a registered source/action). False when it is hand-coded UI over a
   * hand-coded route — the state most of Unbox is still in.
   */
  composed: boolean;
  /** Registered `DataSourceDefinition` ids this step reads through. */
  sourceIds?: string[];
  /** Registered `ActionDefinition` ids this step fires. */
  actionIds?: string[];
  /**
   * The route this step drives when it is NOT expressed through a registered
   * source/action. Required for a code-only step — it is what the lineage guard
   * parses.
   */
  endpoint?: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string };
  /** Relations `endpoint` reads. Omit on a composed step — inherited. */
  reads?: TableRef[];
  /** Relations `endpoint` writes. Omit on a composed step — inherited. */
  writes?: TableRef[];
  /** Ably channel this step publishes on, when it has one. */
  realtimeChannel?: string;
}

export interface ProcedureDefinition {
  /** The operator surface this describes. */
  surface: SurfaceKey;
  label: string;
  /** Workflow node types whose nodes this procedure describes. */
  nodeTypes: string[];
  /**
   * Full step catalog for this surface (lineage · Studio · guards). Order here
   * is canonical for declaration honesty, not the operator walk — Unbox walks
   * are owned by {@link UNBOX_FLOWS}.
   */
  steps: ProcedureStep[];
  /** When set, `resolveProcedureSteps` builds from named flows + modifiers. */
  flows?: Record<UnboxFlowId, UnboxFlowDefinition>;
}

/** Explicit ordered keys per phase for one Unbox flow. */
export interface UnboxFlowDefinition {
  label: string;
  intake: readonly string[];
  capture: readonly string[];
  commit: readonly string[];
}

const registry = new Map<SurfaceKey, ProcedureDefinition>();

/** Module-private on purpose: */
function registerProcedure(def: ProcedureDefinition): void {
  if (registry.has(def.surface)) {
    throw new Error(`Station procedure already registered: ${def.surface}`);
  }
  registry.set(def.surface, def);
}

export function getProcedure(surface: SurfaceKey): ProcedureDefinition | undefined {
  return registry.get(surface);
}

export function listProcedures(): ProcedureDefinition[] {
  return [...registry.values()];
}

/** The procedure describing a workflow node's type, or undefined. */
export function procedureForNodeType(type: string): ProcedureDefinition | undefined {
  return listProcedures().find((p) => p.nodeTypes.includes(type));
}

/** Carrier dunnage shots — omitted when `modifiers.isLocalPickup`. */
const LOCAL_PICKUP_OMIT = new Set(['packing_material']);

function isResolveContext(
  value: ProcedureResolveContext | ProcedureVariant,
): value is ProcedureResolveContext {
  return typeof value === 'object' && value !== null && 'flow' in value;
}

function normalizeContext(
  ctx: ProcedureResolveContext | ProcedureVariant = { flow: 'found' },
): ProcedureResolveContext {
  return isResolveContext(ctx) ? ctx : variantToResolveContext(ctx);
}

/** The ordered steps for one carton's shape — THE resolver both surfaces read. */
export function resolveProcedureSteps(
  procedure: ProcedureDefinition,
  ctx: ProcedureResolveContext | ProcedureVariant = { flow: 'found' },
  phase?: ProcedurePhase,
): ProcedureStep[] {
  const resolved = normalizeContext(ctx);
  const byKey = new Map(procedure.steps.map((s) => [s.key, s]));

  if (procedure.flows) {
    const flow = procedure.flows[resolved.flow];
    const mods = resolved.modifiers ?? {};
    let captureKeys = [...flow.capture];
    if (mods.needsClassify && !captureKeys.includes('classify')) {
      captureKeys = ['classify', ...captureKeys];
    }
    if (mods.isLocalPickup) {
      captureKeys = captureKeys.filter((k) => !LOCAL_PICKUP_OMIT.has(k));
    }
    captureKeys = applyCaptureOrderOverride(captureKeys, mods.captureOrderOverride);

    const keys =
      phase === 'intake'
        ? [...flow.intake]
        : phase === 'capture'
          ? captureKeys
          : phase === 'commit'
            ? [...flow.commit]
            : [...flow.intake, ...captureKeys, ...flow.commit];

    return keys.map((key) => {
      const step = byKey.get(key);
      if (!step) {
        throw new Error(`Procedure "${procedure.surface}" flow "${resolved.flow}" references unknown step "${key}"`);
      }
      return step;
    });
  }

  // Surfaces without named flows: return the catalog, optionally phase-filtered.
  return procedure.steps.filter((s) => (phase ? s.phase === phase : true));
}

/** Every Unbox flow id — guards iterate this, not invent a second list. */
export const UNBOX_FLOW_IDS: readonly UnboxFlowId[] = ['found', 'unfound', 'return'];

// ─── Unbox ───────────────────────────────────────────────────

/** The read/write triple every `/api/receiving-photos` step shares. */
const RECEIVING_PHOTO_READS: TableRef[] = [
  { table: 'receiving_carton' },
  { table: 'receiving_scans' },
  { table: 'receiving_triage' },
  { table: 'photos', via: '@/lib/photos/service' },
  { table: 'photo_storage', via: '@/lib/photos/service' },
];

const RECEIVING_PHOTO_WRITES: TableRef[] = [
  { table: 'photos', via: '@/lib/photos/service' },
  { table: 'photo_storage', via: '@/lib/photos/service' },
  { table: 'photo_entity_links', via: '@/lib/photos/claim-link' },
];

const UNBOX_STEP_CATALOG: Record<string, ProcedureStep> = {
  scan: {
    key: 'scan',
    label: 'Scan the carton',
    summary:
      'Scan the tracking number at the bench. Resolves the carton against its PO, or opens an unfound carton when nothing matches.',
    phase: 'intake',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/lookup-po' },
    reads: [
      { table: 'receiving_carton' },
      { table: 'receiving_line' },
      { table: 'receiving_line_zoho' },
      { table: 'receiving_scans' },
      { table: 'receiving_triage' },
      { table: 'receiving_unbox' },
      { table: 'sku_catalog' },
      { table: 'zoho_po_mirror' },
    ],
    writes: [
      { table: 'receiving_carton' },
      { table: 'receiving_line' },
      { table: 'receiving_scans' },
    ],
  },
  classify: {
    key: 'classify',
    label: 'Classify',
    summary:
      'Name what this carton is (PO / return / trade-in / pickup) before anything else can be recorded against it.',
    phase: 'capture',
    composed: false,
    endpoint: { method: 'PATCH', path: '/api/receiving/:id' },
    reads: [
      { table: 'items' },
      { table: 'local_pickup_orders' },
      { table: 'locations' },
      { table: 'receiving_carton' },
      { table: 'receiving_line' },
      { table: 'receiving_line_testing' },
      { table: 'receiving_line_zoho' },
      { table: 'receiving_scans' },
      { table: 'receiving_triage' },
      { table: 'receiving_unbox' },
      { table: 'serial_unit_provenance' },
      { table: 'serial_units' },
      { table: 'shipping_tracking_numbers' },
      { table: 'sku_catalog' },
      { table: 'staff' },
    ],
    writes: [{ table: 'receiving_carton' }],
  },
  arrival_label_photo: {
    key: 'arrival_label_photo',
    label: 'Label photo',
    summary:
      'Door evidence before the box is opened — the carrier label on the unopened carton. Dock Band 1 is Link | Upload | Send to phone stamped arrival_package · shipping_label only \u2014 never unbox_carton (a bench shot here would void the receive-gate control).',
    phase: 'capture',
    photoStage: 'arrival_package',
    photoAspect: 'shipping_label',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving-photos' },
    reads: RECEIVING_PHOTO_READS,
    writes: RECEIVING_PHOTO_WRITES,
  },
  arrival_box_photo: {
    key: 'arrival_box_photo',
    label: 'Box photo',
    summary:
      'Door evidence before the box is opened — the carton exterior (crush, punctures, water, tape). Dock Band 1 stamps arrival_package · box_exterior only \u2014 never unbox_carton.',
    phase: 'capture',
    photoStage: 'arrival_package',
    photoAspect: 'box_exterior',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving-photos' },
    reads: RECEIVING_PHOTO_READS,
    writes: RECEIVING_PHOTO_WRITES,
  },
  shipping_label_photo: {
    key: 'shipping_label_photo',
    label: 'Shipping label',
    summary:
      'Photograph the carrier label on the unopened box \u2014 the tracking, the sender and the service, in one shot a claim can be argued from.',
    phase: 'capture',
    photoStage: 'unbox_carton',
    photoAspect: 'shipping_label',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving-photos' },
    reads: RECEIVING_PHOTO_READS,
    writes: RECEIVING_PHOTO_WRITES,
  },
  box_photo: {
    key: 'box_photo',
    label: 'The box',
    summary:
      'Photograph the box itself \u2014 crush, punctures, water, tape tampering. Bench evidence, so it stamps unbox_carton and never the arrival stage.',
    phase: 'capture',
    photoStage: 'unbox_carton',
    photoAspect: 'box_exterior',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving-photos' },
    reads: RECEIVING_PHOTO_READS,
    writes: RECEIVING_PHOTO_WRITES,
  },
  packing_material: {
    key: 'packing_material',
    label: 'Packing material',
    summary:
      'Photograph the dunnage inside the opened box \u2014 what the shipper did or did not protect the unit with.',
    phase: 'capture',
    photoStage: 'unbox_carton',
    photoAspect: 'packing_material',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving-photos' },
    reads: RECEIVING_PHOTO_READS,
    writes: RECEIVING_PHOTO_WRITES,
  },
  contents: {
    key: 'contents',
    label: 'Contents',
    summary:
      'Confirm what is actually in this box against the line list. Nothing recorded that a human had read the manifest before working it \u2014 this step is that fact.',
    phase: 'capture',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/:id/contents-confirm' },
    reads: [{ table: 'receiving_unbox', via: '@/lib/receiving/streets/carton-street-write' }],
    writes: [{ table: 'receiving_unbox', via: '@/lib/receiving/streets/carton-street-write' }],
  },
  condition: {
    key: 'condition',
    label: 'Condition',
    summary:
      'Grade the unit \u2014 one tap or one scanned condition code. The stored default pre-selects the chip, so this is a confirmation rather than a decision from scratch; it is still an explicit act, and `condition_graded_at` is what records that it happened.',
    phase: 'capture',
    perUnit: true,
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/lines/:id/condition' },
    reads: [{ table: 'receiving_line' }],
    writes: [{ table: 'receiving_line_testing' }],
  },
  item_photos: {
    key: 'item_photos',
    label: 'Item photos',
    summary:
      'Photograph each unit as received \u2014 the evidence a claim is later argued from. Which of the six aspects are REQUIRED is org policy, not a constant.',
    phase: 'capture',
    photoStage: 'unbox_item',
    photoAspectSet: ASPECTS_BY_STAGE.unbox_item,
    perUnit: true,
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving-photos' },
    reads: RECEIVING_PHOTO_READS,
    writes: RECEIVING_PHOTO_WRITES,
  },
  serial: {
    key: 'serial',
    label: 'Serial',
    summary:
      'Scan each unit\u2019s serial, or waive it for a line that genuinely has none. This is what turns a quantity into tracked units.',
    phase: 'capture',
    perUnit: true,
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/scan-serial' },
    reads: [
      { table: 'receiving_line' },
      { table: 'receiving_line_zoho' },
      { table: 'serial_units', via: '@/lib/receiving/serial-attach' },
      { table: 'serial_unit_provenance', via: '@/lib/receiving/serial-attach' },
    ],
    writes: [
      { table: 'serial_units', via: '@/lib/receiving/serial-attach' },
      { table: 'receiving_line_testing', via: '@/lib/receiving/serial-projection' },
    ],
  },
  label: {
    key: 'label',
    label: 'Label',
    summary:
      'Read the face this carton is about to print — the title, the condition and the code the shelf will be found by — and confirm it. A capture step, never the print itself: the printed face is the last thing an operator can still correct for free, and once the sticker is on the box a wrong one costs a re-label at the shelf.',
    phase: 'capture',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/lines/:id/label-previewed' },
    reads: [{ table: 'receiving_line' }],
    writes: [{ table: 'receiving_line_testing' }],
  },
  print: {
    key: 'print',
    label: 'Print the label',
    summary: 'Print the carton or item label. First print wins \u2014 the stamp survives a refresh and another device.',
    phase: 'commit',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/lines/:id/label-printed' },
    reads: [{ table: 'receiving_line' }],
    writes: [{ table: 'receiving_line_testing' }],
  },
  stage: {
    key: 'stage',
    label: 'Location',
    summary:
      'Scan the putaway bin barcode where this unit will live after receive. Dock Band 1 owns the wedge; the middle Placement panel confirms room · bin · barcode. Distinct from Arrival door carton staging.',
    phase: 'commit',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/lines/:id/stage' },
    reads: [
      { table: 'receiving_line' },
      { table: 'receiving_line_putaway' },
      { table: 'locations' },
    ],
    writes: [{ table: 'receiving_line_putaway' }],
  },
  receive: {
    key: 'receive',
    label: 'Receive to the purchase order',
    summary:
      'Commit the received quantities: units become inventory, the line advances, and the receipt is pushed to the inventory provider. Prefer the staged location when present; otherwise org default putaway.',
    phase: 'commit',
    composed: false,
    endpoint: { method: 'POST', path: '/api/receiving/mark-received-po' },
    reads: [
      { table: 'receiving_carton' },
      { table: 'receiving_line' },
      { table: 'receiving_line_zoho' },
      { table: 'serial_units' },
      { table: 'serial_unit_provenance' },
      { table: 'shipping_tracking_numbers' },
      { table: 'staff' },
      { table: 'inventory_events', via: '@/lib/receiving/receive-line' },
      { table: 'items', via: '@/lib/receiving/receive-line' },
    ],
    writes: [
      { table: 'receiving_line', via: '@/lib/receiving/receive-line' },
      { table: 'serial_units', via: '@/lib/receiving/receive-line' },
      { table: 'sku_stock_ledger', via: '@/lib/receiving/receive-line' },
    ],
  },
};

/** Canonical catalog order for lineage / Studio honesty (not the operator walk). */
const UNBOX_CATALOG_ORDER = [
  'scan',
  'classify',
  'arrival_label_photo',
  'arrival_box_photo',
  'shipping_label_photo',
  'box_photo',
  'packing_material',
  'contents',
  'condition',
  'item_photos',
  'serial',
  'label',
  'print',
  'stage',
  'receive',
] as const;

/**
 * Found capture walk — door Label/Box photos own shipping-label + exterior
 * evidence; bench `shipping_label_photo` / `box_photo` / `item_photos` stay in
 * the catalog for lineage / Studio but are not on the operator walk.
 */
const FOUND_CAPTURE = [
  'arrival_label_photo',
  'arrival_box_photo',
  'packing_material',
  'contents',
  'serial',
  'condition',
  'label',
] as const;

const UNFOUND_CAPTURE = ['classify', ...FOUND_CAPTURE] as const;

/** Return: serial before condition — the scan names the unit being graded. */
const RETURN_CAPTURE = [
  'arrival_label_photo',
  'arrival_box_photo',
  'packing_material',
  'contents',
  'serial',
  'condition',
  'label',
] as const;

const UNBOX_INTAKE = ['scan'] as const;
const UNBOX_COMMIT = ['print', 'stage', 'receive'] as const;

const UNBOX_FLOWS: Record<UnboxFlowId, UnboxFlowDefinition> = {
  found: {
    label: UNBOX_FLOW_LABEL.found,
    intake: UNBOX_INTAKE,
    capture: FOUND_CAPTURE,
    commit: UNBOX_COMMIT,
  },
  unfound: {
    label: UNBOX_FLOW_LABEL.unfound,
    intake: UNBOX_INTAKE,
    capture: UNFOUND_CAPTURE,
    commit: UNBOX_COMMIT,
  },
  return: {
    label: UNBOX_FLOW_LABEL.return,
    intake: UNBOX_INTAKE,
    capture: RETURN_CAPTURE,
    commit: UNBOX_COMMIT,
  },
};

const unboxProcedure: ProcedureDefinition = {
  surface: 'unbox',
  label: 'Unbox',
  nodeTypes: ['receiving'],
  steps: UNBOX_CATALOG_ORDER.map((key) => UNBOX_STEP_CATALOG[key]),
  flows: UNBOX_FLOWS,
};

let builtinsRegistered = false;
export function registerBuiltinProcedures(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerProcedure(unboxProcedure);
}
