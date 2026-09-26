/** The translation table: */

import type { SerialState } from '@/lib/inventory/state-machine';
import type { InventoryEventType } from '@/lib/inventory/events';
import { WORKFLOW_STAGES } from '@/lib/receiving/workflow-stages';
import type { CbvBizStep, CbvDisposition, EpcisEventType } from './epcis-vocabulary';

/** A resolved CBV reading of one Cycle Forge state or event. */
type CbvMapping =
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

/** `inventory_events.event_type` → CBV. */
const EVENT_TYPE_TO_CBV: Record<InventoryEventType, CbvMapping> = {
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

/** `serial_units.current_status` → CBV. */
const SERIAL_STATE_TO_CBV: Record<SerialState, CbvMapping> = {
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

/** `WORKFLOW_STAGES` key → CBV — the inbound receiving/testing lifecycle. */
const WORKFLOW_STAGE_TO_CBV: Record<string, CbvMapping> = {
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
const WORKFLOW_STAGE_KEYS = Object.keys(WORKFLOW_STAGES);

/** Which EPCIS event type a Cycle Forge event becomes. */
export function epcisEventTypeForInventoryEvent(): EpcisEventType {
  return 'ObjectEvent';
}

/** EPCIS `action` for an inventory event. */
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
function cbvForSerialState(
  state: SerialState | string | null | undefined,
): Extract<CbvMapping, { mapped: true }> | null {
  if (!state) return null;
  const m = SERIAL_STATE_TO_CBV[state as SerialState];
  return m?.mapped ? m : null;
}
