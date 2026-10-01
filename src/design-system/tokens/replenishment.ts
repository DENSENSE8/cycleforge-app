import type { RecordStateFace } from './record';

type ReplenishmentRecordState =
  | 'detected'
  | 'pending_review'
  | 'planned_for_po'
  | 'po_created'
  | 'waiting_for_receipt'
  | 'fulfilled'
  | 'cancelled';

export const REPLENISHMENT_RECORD_STATE: Readonly<Record<ReplenishmentRecordState, RecordStateFace>> = {
  detected: { id: 'detected', code: 'DET', label: 'Detected', tone: 'danger', icon: 'alarm-clock' },
  pending_review: { id: 'pending_review', code: 'REV', label: 'Review', tone: 'warning', icon: 'circle-help' },
  planned_for_po: { id: 'planned_for_po', code: 'PLN', label: 'Planned', tone: 'info', icon: 'clipboard-check' },
  po_created: { id: 'po_created', code: 'PO', label: 'PO created', tone: 'fulfillment', icon: 'file-check' },
  waiting_for_receipt: { id: 'waiting_for_receipt', code: 'WAI', label: 'Awaiting receipt', tone: 'info', icon: 'truck' },
  fulfilled: { id: 'fulfilled', code: 'FUL', label: 'Fulfilled', tone: 'success', icon: 'package-check' },
  cancelled: { id: 'cancelled', code: 'CXL', label: 'Cancelled', tone: 'danger', icon: 'circle-x' },
};
