/**
 * Carton-read lookup utilities — Copy text builders for `/carton/[id]`.
 *
 * Station chrome no longer hosts these; the read surface reached from `/search`
 * (and other observe openers) owns them.
 */

import { formatDateTimePST } from '@/utils/date';

type CartonReadCopyInput = {
  id: number;
  zoho_purchaseorder_number?: string | null;
  tracking?: string | null;
  received_at?: string | null;
  zoho_purchase_receive_id?: string | null;
  qa_status?: string | null;
  disposition_code?: string | null;
  condition_grade?: string | null;
};

/** Multiline clipboard text for carton identity facts (mirror ReceivingDetailsStack). */
export function buildCartonReadCopyText(log: CartonReadCopyInput): string {
  const poNumber = (log.zoho_purchaseorder_number || '').trim();
  return [
    poNumber ? `PO #${poNumber}` : null,
    `Receiving #${log.id}`,
    log.tracking ? `Tracking: ${log.tracking}` : null,
    `Received: ${log.received_at ? formatDateTimePST(log.received_at) : '-'}`,
    log.zoho_purchase_receive_id ? `Zoho Receive: ${log.zoho_purchase_receive_id}` : null,
    log.qa_status ? `QA: ${log.qa_status}` : null,
    log.disposition_code ? `Disposition: ${log.disposition_code}` : null,
    log.condition_grade ? `Condition: ${log.condition_grade}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
