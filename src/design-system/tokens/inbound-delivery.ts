import {
  INBOUND_DELIVERY,
  type InboundDeliveryState,
} from '@cycleforge/design-tokens';
import type { RecordStateFace } from './industrial-record';

export {
  INBOUND_DELIVERY,
  INBOUND_DELIVERY_STATES,
  type InboundDeliveryState,
} from '@cycleforge/design-tokens';

/** Resolve one inbound carrier state into the generic industrial-record face. */
export function inboundDeliveryRecordState(state: InboundDeliveryState): RecordStateFace {
  return { id: state, ...INBOUND_DELIVERY[state] };
}

/** Unknown/null carrier answers paint the explicit UNKNOWN face, never an outbound alias. */
export function resolveInboundDeliveryRecordState(
  state: string | null | undefined,
): RecordStateFace {
  const key = state && state in INBOUND_DELIVERY
    ? state as InboundDeliveryState
    : 'UNKNOWN';
  return inboundDeliveryRecordState(key);
}
