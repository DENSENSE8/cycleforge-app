import { resolveInboundDeliveryRecordState } from '@/design-system/tokens/inbound-delivery';
import { RECEIVING_LIFECYCLE } from '@/design-system/tokens/receiving-lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import type { ReceivingLineRow } from './receiving-line-row';
import { deriveReceivingLineStatus } from './workflow-stages';

/** Read the receiving lifecycle, never infer a warehouse scan from list membership. */
export function dockedReceivingState(row: ReceivingLineRow): RecordStateFace {
  // Negative ids are carton placeholders, not received item lines. Their
  // carton workflow can say DONE without any inventory receipt at all.
  if (row.id <= 0) {
    if (row.unboxed_at) return RECEIVING_LIFECYCLE.UNBOXED;
    if (row.received_at || row.scanned_at) return RECEIVING_LIFECYCLE.SCANNED;
    return resolveInboundDeliveryRecordState(row.delivery_state);
  }
  const workflow = String(row.workflow_status || '').trim().toUpperCase();
  if (['FAILED', 'RTV', 'SCRAP'].includes(workflow)) return RECEIVING_LIFECYCLE.EXCEPTION;
  if (row.received_done_at || workflow === 'RECEIVED') return RECEIVING_LIFECYCLE.RECEIVED;
  const phase = deriveReceivingLineStatus(workflow);
  if (phase !== 'INCOMING') return RECEIVING_LIFECYCLE[phase];
  if (row.unboxed_at) return RECEIVING_LIFECYCLE.UNBOXED;
  if (row.received_at || row.scanned_at) return RECEIVING_LIFECYCLE.SCANNED;
  return resolveInboundDeliveryRecordState(row.delivery_state);
}

export function dockedReceivedQuantity(row: ReceivingLineRow): number {
  return Number(row.quantity_received ?? 0);
}
