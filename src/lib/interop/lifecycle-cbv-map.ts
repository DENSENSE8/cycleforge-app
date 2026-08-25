/**
 * The translation table: Cycle Forge's own vocabularies → GS1 CBV terms.
 *
 * Pure and client-safe. This is the ONLY place the two sides meet.
 *
 * ## Map, never re-derive
 *
 * Cycle Forge already owns three status vocabularies, each with a source
 * module: `SerialState` (`@/lib/inventory/state-machine`), `InventoryEventType`
 * (`@/lib/inventory/events`) and `WORKFLOW_STAGES`
 * (`@/lib/receiving/workflow-stages`). This module imports all three and
 * restates none of them. A CBV map that hardcoded its own copy of the status
 * strings would be a second status vocabulary, and it would drift the first
 * time a lifecycle changed — which is the failure
 * exists to prevent.
 *
 * The two `Record<>` maps below are TOTAL over their key types, so adding a
 * lifecycle state to either SoT is a **compile error here** until someone
 * decides what it means to a partner. That is the enforcement; the guard
 * (`interop-vocabulary.guard.test.ts`) is the backstop that also checks the
 * runtime arrays and that every emitted term is really in CBV.
 *
 * ## Two of the three imports are type-only, deliberately
 *
 * `state-machine.ts` and `events.ts` both reach `@/lib/db`, which carries
 * `import 'server-only'`. A value import here would drag the Neon driver into
 * every client bundle that touches interop — the bundle-altitude trap in
 * `.claude/rules/build-gotchas.md`. `import type` is erased, so the totality
 * check costs nothing at runtime. `workflow-stages.ts` has no imports at all
 * and is safe to bring in as a value.
 *
 * ## "Unmappable" is a decision, not a gap
 *
 * A state maps to a CBV term or is explicitly `{ mapped: false, reason }`.
 * There is no third option and no fallback to `other` — CBV's `other` bizStep
 * means "a business step outside this vocabulary happened", which is a claim,
 * whereas most unmapped states here are *not business steps at all* (a queue
 * position, an annotation, a listing). Emitting `other` for them would put
 * noise in a partner's feed that reads as signal.
 */

import type { SerialState } from '@/lib/inventory/state-machine';
import type { InventoryEventType } from '@/lib/inventory/events';
import { WORKFLOW_STAGES } from '@/lib/receiving/workflow-stages';
import type { CbvBizStep, CbvDisposition, EpcisEventType } from './epcis-vocabulary';

/**
 * A resolved CBV reading of one Cycle Forge state or event.
 *
 * `disposition` is nullable on a mapped entry because not every business step
 * asserts a new state of the goods. A bin-to-bin move has a real `bizStep`
 * (`storing`) and changes nothing about the item's condition or availability,
 * so emitting a disposition would be inventing a fact.
 */
export type CbvMapping =
  | {
      mapped: true;
      bizStep: CbvBizStep;
      disposition: CbvDisposition | null;
      /** Why this reading, when the choice is not self-evident. */
      note?: string;
    }
  | {
      mapped: false;
      /** Why this state has no honest CBV reading. Required. */
      reason: string;
    };

const unmappable = (reason: string): CbvMapping => ({ mapped: false, reason });

const step = (
  bizStep: CbvBizStep,
  disposition: CbvDisposition | null,
  note?: string,
): CbvMapping => ({ mapped: true, bizStep, disposition, note });

/**
 * `inventory_events.event_type` → CBV.
 *
 * This is the PRIMARY map: `inventory_events` is the lifecycle spine, so it is
 * what the EPCIS projection actually reads. The serial-state map below is the
 * secondary reading, used for an event's `prev`/`next` status.
 */
export const EVENT_TYPE_TO_CBV: Record<InventoryEventType, CbvMapping> = {
  RECEIVED: step('receiving', 'in_progress'),
  TEST_START: step('inspecting', 'in_progress'),
  TEST_PASS: step('inspecting', 'conformant'),
  TEST_FAIL: step('inspecting', 'non_conformant'),
  PUTAWAY: step('stocking', 'sellable_accessible'),
  MOVED: step(
    'storing',
    null,
    'A bin-to-bin move changes location, not condition or availability — so no disposition is asserted.',
  ),
  PICKED: step('picking', 'in_progress'),
  FORCE_PICK: step(
    'picking',
    'in_progress',
    'Same CBV reading as PICKED. The override is a Cycle Forge fact about who authorised it, not a different business step, so it rides in the cycleforge_ facet rather than distorting the standard term.',
  ),
  PACKED: step('packing', 'in_progress'),
  SHIPPED: step('shipping', 'in_transit'),
  ADJUSTED: step(
    'cycle_counting',
    null,
    'A quantity correction. CBV has no "adjustment" step; cycle_counting is the process that produces one.',
  ),
  RETURNED: step('receiving', 'returned'),
  SCRAPPED: step('destroying', 'destroyed'),
  LABELED: step(
    'packing',
    null,
    'CBV has no labelling step. `encoding` is specifically writing an EPC to a tag, which this is not — a carrier label is part of packing.',
  ),
  ALLOCATED: step('reserving', 'reserved'),
  RELEASED: step(
    'reserving',
    'available',
    'Releasing an allocation. The bizStep names the process (reservation management); the disposition names the state it leaves the goods in.',
  ),
  REPAIR_STARTED: step('repairing', 'in_progress'),
  REPAIR_COMPLETED: step('repairing', 'conformant'),
  HELD: step('holding', 'unavailable'),
  RELEASED_HOLD: step('holding', 'available'),
  LISTED: unmappable(
    'Listing a unit on a sales channel is a commerce act, not a supply-chain step. CBV covers the SALE (`retail_selling`), not the offer — mapping it would tell a partner the unit had left the building.',
  ),
  NOTE: unmappable(
    'An operator annotation. Nothing happened to the goods, so there is no business step to report.',
  ),
};

/**
 * `serial_units.current_status` → CBV.
 *
 * Used for the state an event moved a unit INTO, and for a snapshot read of a
 * unit that has no event of its own. Kept separate from the event map because
 * a state and the act that produced it are different things — `SHIPPED` the
 * state is a disposition (`in_transit`), `SHIPPED` the event is a step
 * (`shipping`) — and collapsing them is how a feed starts reporting steps that
 * never happened.
 */
export const SERIAL_STATE_TO_CBV: Record<SerialState, CbvMapping> = {
  UNKNOWN: unmappable(
    'The absence of a known state, not a state. Nothing has been observed to report.',
  ),
  RECEIVED: step('receiving', 'in_progress'),
  TRIAGED: step('inspecting', 'in_progress'),
  IN_REPAIR: step('repairing', 'in_progress'),
  REPAIR_DONE: step('repairing', 'conformant'),
  IN_TEST: step('inspecting', 'in_progress'),
  GRADED: step('inspecting', 'conformant'),
  TESTED: step('inspecting', 'conformant'),
  STOCKED: step('stocking', 'sellable_accessible'),
  ALLOCATED: step('reserving', 'reserved'),
  PICKING: step('picking', 'in_progress'),
  PICKED: step('picking', 'in_progress'),
  PACKING: step('packing', 'in_progress'),
  PACKED: step('packing', 'in_progress'),
  LABELED: step('packing', null),
  STAGED: step('staging_outbound', 'in_progress'),
  LOADING: step('loading', 'in_progress'),
  SHIPPED: step('shipping', 'in_transit'),
  RETURNED: step('receiving', 'returned'),
  RMA: step(
    'holding',
    'returned',
    'A returned unit held pending an authorised disposition. `holding` is the deliberate act; `returned` is how it got there.',
  ),
  SCRAPPED: step('destroying', 'destroyed'),
  ON_HOLD: step('holding', 'unavailable'),
};

/**
 * `WORKFLOW_STAGES` key → CBV — the inbound receiving/testing lifecycle.
 *
 * Keyed by `string` rather than a union because `WORKFLOW_STAGES` is itself a
 * `Record<string, …>`; the guard asserts this map's keys and that record's
 * keys are identical in both directions, which recovers the totality the type
 * cannot give.
 */
export const WORKFLOW_STAGE_TO_CBV: Record<string, CbvMapping> = {
  EXPECTED: unmappable(
    'A vendor has issued the goods but nothing has been observed at the dock. EPCIS reports what happened; an expectation has not happened.',
  ),
  ARRIVED: step('arriving', 'in_progress'),
  MATCHED: step(
    'receiving',
    'in_progress',
    'Matching a carton to its PO is the association EPCIS carries in the `why` dimension: an ObjectEvent with a `po` bizTransaction, never a bare TransactionEvent.',
  ),
  UNBOXED: step('unpacking', 'in_progress'),
  AWAITING_TEST: unmappable(
    'A queue position, not an act. `holding` would claim a deliberate hold that nobody placed.',
  ),
  IN_TEST: step('inspecting', 'in_progress'),
  PASSED: step('inspecting', 'conformant'),
  FAILED: step('inspecting', 'non_conformant'),
  RTV: step('shipping', 'returned', 'Return to vendor — goods leaving, in returned condition.'),
  SCRAP: step('destroying', 'destroyed'),
  DONE: step(
    'receiving',
    'completeness_verified',
    'The receipt is closed and its contents reconciled against the PO.',
  ),
};

/** Every `WORKFLOW_STAGES` key, for the guard's two-way comparison. */
export const WORKFLOW_STAGE_KEYS = Object.keys(WORKFLOW_STAGES);

/**
 * Which EPCIS event type a Cycle Forge event becomes.
 *
 * **Everything from `inventory_events` is an `ObjectEvent`, and that is not a
 * simplification.** `inventory_events` records what happened to a unit — its
 * state, its location, who touched it — and an ObjectEvent is exactly "these
 * objects were observed at this time and place, for this business reason".
 *
 * The other four types need facts this table does not carry:
 *
 *   - `AggregationEvent` needs a parent↔child CONTAINMENT pair. Cycle Forge
 *     has the parents (`receiving_carton`, `handling_units`) but the event log
 *     records a unit's status change, not the moment it entered a box. Emitting
 *     one would require inferring containment from adjacency, and an inferred
 *     aggregation is exactly the kind of plausible-but-wrong claim that makes a
 *     feed untrustworthy.
 *   - `TransactionEvent` is *seldom needed* by GS1's own guidance: a business
 *     transaction rides in the `why` dimension of every other event type, so an
 *     ObjectEvent with a `bizTransactionList` is what partners expect. A bare
 *     TransactionEvent here would be technically valid and read wrong.
 *   - `TransformationEvent` needs inputs consumed and outputs produced. Repair
 *     is the real candidate (parts in, unit out), but `part_links` is not wired
 *     into the event spine, so the inputs are not knowable from here.
 *   - `AssociationEvent` needs a permanent attachment. `handling_unit_id` is
 *     explicitly CURRENT-not-historical membership (see the birth migration),
 *     which is reversible — so it is Aggregation-shaped, not Association-shaped,
 *     and it is not knowable from this table either way.
 *
 * Each of those is a real future phase with a real prerequisite, named here so
 * the next person extends the source rather than guessing from `inventory_events`.
 */
export function epcisEventTypeForInventoryEvent(): EpcisEventType {
  return 'ObjectEvent';
}

/**
 * EPCIS `action` for an inventory event.
 *
 * `ADD` when the object enters the observer's world, `DELETE` when it leaves,
 * `OBSERVE` for everything in between. Note this is about the EPC's lifecycle
 * in the feed, not about a database row.
 */
export function epcisActionForEventType(type: InventoryEventType): 'ADD' | 'OBSERVE' | 'DELETE' {
  if (type === 'RECEIVED') return 'ADD';
  if (type === 'SHIPPED' || type === 'SCRAPPED') return 'DELETE';
  return 'OBSERVE';
}

/** Convenience: the CBV reading for an event type, or `null` when unmappable. */
export function cbvForEventType(
  type: InventoryEventType,
): Extract<CbvMapping, { mapped: true }> | null {
  const m = EVENT_TYPE_TO_CBV[type];
  return m?.mapped ? m : null;
}

/** Convenience: the CBV reading for a serial state, or `null` when unmappable. */
export function cbvForSerialState(
  state: SerialState | string | null | undefined,
): Extract<CbvMapping, { mapped: true }> | null {
  if (!state) return null;
  const m = SERIAL_STATE_TO_CBV[state as SerialState];
  return m?.mapped ? m : null;
}
