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

/** Unknown/null carrier answers paint the explicit UNKNOWN face, never an outbound alias. */
export function resolveInboundDeliveryRecordState(
  state: string | null | undefined,
): RecordStateFace {
  const key = state && state in INBOUND_DELIVERY
    ? state as InboundDeliveryState
    : 'UNKNOWN';
  return { id: key, ...INBOUND_DELIVERY[key] };
}
