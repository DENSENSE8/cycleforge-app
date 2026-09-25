export type ReplenishmentRequestStatus =
  | 'detected'
  | 'pending_review'
  | 'planned_for_po'
  | 'po_created'
  | 'waiting_for_receipt'
  | 'fulfilled'
  | 'cancelled';

export const REPLENISHMENT_ALLOWED_TRANSITIONS: Readonly<
  Record<ReplenishmentRequestStatus, readonly ReplenishmentRequestStatus[]>
> = {
  detected: ['pending_review', 'cancelled'],
  pending_review: ['planned_for_po', 'cancelled'],
  planned_for_po: ['po_created', 'pending_review', 'cancelled'],
  po_created: ['waiting_for_receipt', 'pending_review'],
  waiting_for_receipt: ['fulfilled', 'po_created'],
  fulfilled: [],
  cancelled: [],
};
