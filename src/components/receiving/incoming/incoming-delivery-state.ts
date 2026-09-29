import { type RecordStateFace } from '@/design-system/tokens/industrial-record';
import { resolveInboundDeliveryRecordState } from '@/design-system/tokens/inbound-delivery';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  INCOMING_EXCEPTION_VERB,
  incomingExceptionLabel,
  incomingExceptionReason,
  parseIncomingExceptionCode,
  type IncomingExceptionReason,
} from '@/lib/receiving/incoming-exceptions';

const DELIVERY_RISK: Record<string, number> = {
  WRONG_DESTINATION: 100,
  TRACKING_UNAVAILABLE: 95,
  CARRIER_MISMATCH: 90,
  DELIVERED_UNOPENED: 85,
  DELIVERED_NOT_UNBOXED: 80,
  STALLED: 70,
  ARRIVING_TODAY: 60,
  AWAITING_TRACKING: 50,
  PENDING_CARRIER: 40,
  IN_TRANSIT: 30,
  UNKNOWN: 20,
  RECEIVED: 10,
};

/** Exception reasons with no carrier-state twin in `INBOUND_DELIVERY`. */
const EXCEPTION_ONLY_FACE: Readonly<Record<'ERP_AHEAD' | 'DELIVERED_OVERDUE', Omit<RecordStateFace, 'id'>>> = {
  ERP_AHEAD: { code: 'ERP', label: incomingExceptionLabel('ERP_AHEAD'), tone: 'danger', icon: 'package-open' },
  DELIVERED_OVERDUE: { code: 'OVD', label: incomingExceptionLabel('DELIVERED_OVERDUE'), tone: 'danger', icon: 'inbox' },
};

/** A row's face: its exception reason (Exceptions view) outranks its carrier state. */
export function incomingDeliveryRecordState(row: ReceivingLineRow): RecordStateFace {
  const exception = parseIncomingExceptionCode(row.exception_code);
  if (exception === 'ERP_AHEAD' || exception === 'DELIVERED_OVERDUE') {
    return { id: exception, ...EXCEPTION_ONLY_FACE[exception] };
  }
  if (exception) return { ...resolveInboundDeliveryRecordState(exception), tone: 'danger' };
  return resolveInboundDeliveryRecordState(row.delivery_state);
}

const rowRisk = (row: ReceivingLineRow): number =>
  row.exception_code ? 200 : (DELIVERY_RISK[row.delivery_state ?? 'UNKNOWN'] ?? 0);

/** A purchase's face: its worst line — an exception first, then the riskiest delivery state. */
export function purchaseDeliveryState(rows: readonly ReceivingLineRow[]): RecordStateFace {
  const worst = [...rows].sort((a, b) => rowRisk(b) - rowRisk(a))[0]!;
  return incomingDeliveryRecordState(worst);
}

/** The purchase's first line that needs a person, as WHY + next action. */
export function purchaseExceptionReason(rows: readonly ReceivingLineRow[]): IncomingExceptionReason | null {
  for (const row of rows) {
    const reason = incomingExceptionReason(row);
    if (reason) return reason;
  }
  return null;
}

/** The delivery's purchase handle — the record's title wherever it is read. */
export function purchaseIdentity(row: ReceivingLineRow): string {
  return row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || row.source_order_id || `Line ${row.id}`;
}

export function incomingDeliveryNextAction(state: string | null | undefined): string {
  const exception = parseIncomingExceptionCode(state);
  if (exception === 'ERP_AHEAD' || exception === 'DELIVERED_OVERDUE') return INCOMING_EXCEPTION_VERB[exception];
  switch (state) {
    case 'AWAITING_TRACKING': return 'Attach tracking';
    case 'DELIVERED_UNOPENED': return 'Receive';
    case 'DELIVERED_NOT_UNBOXED': return 'Unbox';
    case 'WRONG_DESTINATION': return 'Investigate';
    case 'TRACKING_UNAVAILABLE':
    case 'CARRIER_MISMATCH':
    case 'STALLED': return 'Resolve';
    case 'RECEIVED': return 'History';
    default: return 'Monitor';
  }
}
