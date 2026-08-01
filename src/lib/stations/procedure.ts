/**
 * Procedure registry — the ORDERED step sequence an operator performs at a
 * surface, and the data each step touches (Operations Studio, Procedure lens).
 *
 * Why this exists beside `station_definitions.config`. A station COMPOSITION
 * answers "what blocks are mounted, in which slot" — `trigger · queue ·
 * workspace · advance · header` is a layout taxonomy, and slots carry no order
 * across each other. A PROCEDURE answers "what does the operator do, in what
 * order, and what does each of those acts read and write". Unbox proves the two
 * are not the same shape: its published composition is two blocks (a scan band
 * and a queue rail), while the real bench procedure is seven acts ending in a
 * push to the purchase order. Projecting only the composition would render a
 * correct, near-empty diagram — worse than none, because people act on it.
 *
 * Vocabulary is BPMN 2.0's, deliberately: a step is an ACTIVITY, a table is a
 * DATA STORE (persistent, shared across processes), the carton/line payload a
 * block renders is a DATA OBJECT (transient, per-instance), and reads/writes are
 * directional DATA ASSOCIATIONS. BPMN is the only mainstream process notation
 * with a normative persistent-vs-transient distinction, which is exactly the
 * line this file draws. The layout it feeds is Value Stream Mapping's — process
 * boxes in a row, a data box beneath each — but VSM's data box holds cycle-time
 * metrics, so we borrow its FRAME, not its contents.
 *
 * Honesty rules, in order of importance:
 *
 *   1. A step declares `composed: true` ONLY when the station registry really
 *      drives it. Everything else is `composed: false` — hand-coded UI over a
 *      hand-coded route. A map that quietly omits the code-only steps is a
 *      worse SOP than a document, because it reads as complete.
 *   2. A composed step names its registry ids and INHERITS their lineage — it
 *      never restates it (one module per concern).
 *   3. A code-only step declares its own `reads`/`writes`, and every one of them
 *      is verified against the route's SQL by `data-lineage.guard.test.ts`.
 *
 * This file is CODE (PR-reviewed capability declaration). Which surfaces a given
 * org actually publishes stays DATA in `station_definitions`.
 */

import type { TableRef } from './contract';
import type { SurfaceKey } from './surface-keys';

/**
 * Which part of the station's work a step belongs to. The split exists because
 * two surfaces render two different slices of one procedure:
 *
 *   intake  — how work reaches the bench (scan, classify). Studio shows it;
 *             the bench checklist does not, because by the time the operator
 *             reads the checklist it has already happened.
 *   capture — the per-carton / per-unit acts. THIS is the slice the station's
 *             right-rail checklist renders.
 *   commit  — the terminal acts that close the carton out (print, receive).
 *             Driven from the terminal dock, not the checklist.
 *
 * Without this, the two surfaces disagreed about what "the Unbox procedure" is
 * — Studio said 7 steps, the bench said 5, and both docblocks claimed to be the
 * operator-facing one.
 */
export type ProcedurePhase = 'intake' | 'capture' | 'commit';

/**
 * The carton-shape flags that vary a procedure. Mirrors the bench's
 * `CaptureStepVocabularyInput` one-for-one, deliberately: they can co-occur
 * (an unfound return), so this is three booleans and not one enum.
 */
export interface ProcedureVariant {
  /** No matched PO — identity resolution comes first. */
  isUnfound?: boolean;
  /** Handed over at the counter — no carrier dunnage to photograph. */
  isLocalPickup?: boolean;
  /** A return — the serial names WHICH unit is being graded. */
  isReturn?: boolean;
}

type VariantFlag = keyof ProcedureVariant;

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
  /** Step exists ONLY when this carton flag is set (`classify` on unfound). */
  onlyWhen?: VariantFlag;
  /** Step is dropped when this carton flag is set (`packing_material` on pickup). */
  omitWhen?: VariantFlag;
  /**
   * On this variant the step moves to sit immediately before the named step.
   * One declared exception, not a general sort: a return captures the serial
   * before the grade, because the scan names the unit the grade applies to.
   */
  moveBefore?: { when: VariantFlag; step: string };
  /**
   * Satisfied by default — renders as done and the active pointer skips it.
   * `condition_grade` is NOT NULL with a default, so the grade always exists;
   * gating on it would stall every carton on a decision already answered.
   */
  ungated?: boolean;
  /** Repeats per unit on a multi-quantity line, so the row carries `n of N`. */
  perUnit?: boolean;
  /** Receiving photo stage this step is evidenced by, when it is a photo step. */
  photoStage?: 'arrival_package' | 'unbox_carton' | 'unbox_item';
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
  /**
   * Workflow node types whose nodes this procedure describes. This is the L1
   * paint binding and it is deliberately CLIENT-RESOLVABLE: `node.type` is on
   * the graph the canvas already fetched, so the Procedure lens repaints with
   * zero additional requests (Studio law #3). The per-org node↔station binding
   * (`station_definitions.workflow_node_id`) is a server fact and stays at L2.
   */
  nodeTypes: string[];
  steps: ProcedureStep[];
}

const registry = new Map<SurfaceKey, ProcedureDefinition>();

/**
 * Module-private on purpose: a procedure is a PR-reviewed capability
 * declaration, so the only registrar is `registerBuiltinProcedures` below.
 * Export it the day an integration ships its own — not before, or it is a dead
 * public API that reads as an extension point nobody uses.
 */
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

/**
 * The ordered steps for one carton's shape — THE resolver both surfaces read.
 *
 * Studio calls it with no phase filter (it shows the whole procedure); the
 * station checklist calls it with `phase: 'capture'`. That is the entire
 * reconciliation: one declaration, two slices, no second vocabulary.
 *
 * Pure and total — an unknown flag combination just yields the base sequence.
 */
export function resolveProcedureSteps(
  procedure: ProcedureDefinition,
  variant: ProcedureVariant = {},
  phase?: ProcedurePhase,
): ProcedureStep[] {
  const on = (flag: VariantFlag | undefined) => !!flag && variant[flag] === true;

  const steps = procedure.steps.filter((s) => {
    if (s.onlyWhen && !on(s.onlyWhen)) return false;
    if (s.omitWhen && on(s.omitWhen)) return false;
    return phase ? s.phase === phase : true;
  });

  // Apply the declared move-before exceptions against the already-filtered list,
  // so a reorder composes with an omission instead of fighting it.
  for (const step of [...steps]) {
    if (!step.moveBefore || !on(step.moveBefore.when)) continue;
    const from = steps.indexOf(step);
    const to = steps.findIndex((s) => s.key === step.moveBefore!.step);
    if (from < 0 || to < 0 || from === to) continue;
    steps.splice(from, 1);
    steps.splice(steps.findIndex((s) => s.key === step.moveBefore!.step), 0, step);
  }

  return steps;
}

// ─── Unbox ───────────────────────────────────────────────────
//
// The pilot. Seven acts, one of which (the queue) is registry-composed today;
// the other six are hand-coded and say so. Reading this file top to bottom is
// meant to be the same experience as watching someone work the bench.

const unboxProcedure: ProcedureDefinition = {
  surface: 'unbox',
  label: 'Unbox',
  nodeTypes: ['receiving'],
  steps: [
    // ── intake ────────────────────────────────────────────────
    {
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

    // ── capture — the slice the station checklist renders ──────
    {
      key: 'classify',
      label: 'Classify',
      summary:
        'Name what this carton is (PO / return / trade-in / pickup) before anything else can be recorded against it.',
      phase: 'capture',
      onlyWhen: 'isUnfound',
      composed: false,
      endpoint: { method: 'PATCH', path: '/api/receiving/:id' },
      // The carton route is a broad read (it also serves the carton GET), so the
      // classify PATCH inherits that whole read set. Declared in full because the
      // lineage guard checks the module, not the branch — see its docblock.
      reads: [
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
        { table: 'staff' },
      ],
      writes: [{ table: 'receiving_carton' }],
    },
    {
      key: 'po_photos',
      label: 'PO / box photos',
      summary:
        'Read the door\u2019s pre-opening shot. A VERIFY step, never a capture: a bench photo stamped here would satisfy the receive gate with a post-opening image and void the control.',
      phase: 'capture',
      photoStage: 'arrival_package',
      composed: false,
      endpoint: { method: 'POST', path: '/api/receiving-photos' },
      reads: [
        { table: 'receiving_carton' },
        { table: 'receiving_scans' },
        { table: 'receiving_triage' },
        { table: 'photos', via: '@/lib/photos/service' },
        { table: 'photo_storage', via: '@/lib/photos/service' },
      ],
      writes: [
        { table: 'photos', via: '@/lib/photos/service' },
        { table: 'photo_storage', via: '@/lib/photos/service' },
        { table: 'photo_entity_links', via: '@/lib/photos/claim-link' },
      ],
    },
    {
      key: 'packing_material',
      label: 'Packing material',
      summary: 'Photograph the opened box and its dunnage \u2014 the same evidentiary moment as the carton itself.',
      phase: 'capture',
      photoStage: 'unbox_carton',
      omitWhen: 'isLocalPickup',
      composed: false,
      endpoint: { method: 'POST', path: '/api/receiving-photos' },
      reads: [
        { table: 'receiving_carton' },
        { table: 'receiving_scans' },
        { table: 'receiving_triage' },
        { table: 'photos', via: '@/lib/photos/service' },
        { table: 'photo_storage', via: '@/lib/photos/service' },
      ],
      writes: [
        { table: 'photos', via: '@/lib/photos/service' },
        { table: 'photo_storage', via: '@/lib/photos/service' },
        { table: 'photo_entity_links', via: '@/lib/photos/claim-link' },
      ],
    },
    {
      key: 'item_photos',
      label: 'Item photos',
      summary: 'Photograph each unit as received \u2014 the evidence a claim is later argued from.',
      phase: 'capture',
      photoStage: 'unbox_item',
      perUnit: true,
      composed: false,
      endpoint: { method: 'POST', path: '/api/receiving-photos' },
      reads: [
        { table: 'receiving_carton' },
        { table: 'receiving_scans' },
        { table: 'receiving_triage' },
        { table: 'photos', via: '@/lib/photos/service' },
        { table: 'photo_storage', via: '@/lib/photos/service' },
      ],
      writes: [
        { table: 'photos', via: '@/lib/photos/service' },
        { table: 'photo_storage', via: '@/lib/photos/service' },
        { table: 'photo_entity_links', via: '@/lib/photos/claim-link' },
      ],
    },
    {
      key: 'condition',
      label: 'Condition',
      summary:
        'Grade the unit. Defaults to A and is only overridden for exceptions, so it renders already-satisfied and the pointer skips it.',
      phase: 'capture',
      ungated: true,
      perUnit: true,
      composed: false,
      endpoint: { method: 'POST', path: '/api/receiving/lines/:id/condition' },
      reads: [{ table: 'receiving_line' }],
      writes: [{ table: 'receiving_line_testing' }],
    },
    {
      key: 'serial',
      label: 'Serial',
      summary:
        'Scan each unit\u2019s serial, or waive it for a line that genuinely has none. This is what turns a quantity into tracked units.',
      phase: 'capture',
      perUnit: true,
      // A return captures the serial BEFORE the grade: the scan names the unit
      // the grade applies to.
      moveBefore: { when: 'isReturn', step: 'condition' },
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

    // ── commit \u2014 the terminal dock, not the checklist ───────────
    {
      key: 'print',
      label: 'Print the label',
      summary: 'Print the carton or item label. First print wins \u2014 the stamp survives a refresh and another device.',
      phase: 'commit',
      composed: false,
      endpoint: { method: 'POST', path: '/api/receiving/lines/:id/label-printed' },
      reads: [{ table: 'receiving_line' }],
      writes: [{ table: 'receiving_line_testing' }],
    },
    {
      key: 'receive',
      label: 'Receive to the purchase order',
      summary:
        'Commit the received quantities: units become inventory, the line advances, and the receipt is pushed to the inventory provider.',
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
  ],
};

let builtinsRegistered = false;
export function registerBuiltinProcedures(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerProcedure(unboxProcedure);
}
