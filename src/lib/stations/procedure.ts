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
 * A single ordered act at the bench. `key` is stable and is what the Studio
 * paints; it is NOT required to match a stepper key (the Unbox progress stepper
 * deliberately shows only the three steps carrying operator signal — see
 * `derive-receiving-step-states.ts`).
 */
export interface ProcedureStep {
  /** Stable within its procedure, e.g. `scan`. */
  key: string;
  label: string;
  /** One line, operator-voiced: what the person does here. */
  summary: string;
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
    {
      key: 'scan',
      label: 'Scan the carton',
      summary:
        'Scan the tracking number at the bench. Resolves the carton against its PO, or opens an unfound carton when nothing matches.',
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
    {
      key: 'queue',
      label: 'Pick from the queue',
      summary:
        'The rail of cartons that have arrived but are not yet unboxed. The one step the station registry already drives.',
      composed: true,
      sourceIds: ['receiving.unbox_queue'],
    },
    {
      key: 'photos',
      label: 'Capture photos',
      summary:
        'Photograph the carton and its contents as received. The evidence a claim is later argued from.',
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
      key: 'serial',
      label: 'Capture serials',
      summary:
        'Scan each unit’s serial, or waive it for a line that genuinely has none. This is what turns a quantity into tracked units.',
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
    {
      key: 'condition',
      label: 'Set the condition',
      summary:
        'Grade the line. Defaults to A and is only overridden for exceptions, so it carries no stepper dot — but the override is durable and feeds recommendations.',
      composed: false,
      endpoint: { method: 'POST', path: '/api/receiving/lines/:id/condition' },
      reads: [{ table: 'receiving_line' }],
      writes: [{ table: 'receiving_line_testing' }],
    },
    {
      key: 'print',
      label: 'Print the label',
      summary:
        'Print the carton or item label. First print wins — the stamp survives a refresh and another device.',
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
