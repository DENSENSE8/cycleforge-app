/**
 * Receiving claim type vocabulary + defaulting, and the claim type → receiving
 * exception code map (the ticket's recorded reason).
 *
 * Leaf SoT — no DB / server-only imports so UI + unit tests can share it.
 * Template body builders stay in `zendesk-claim-template.ts` and re-export these.
 */

import type { ReceivingExceptionCode } from '@/lib/receiving/exception-codes';

export type ClaimType =
  | 'damage'
  | 'missing'
  | 'wrong_item'
  | 'vendor_defect'
  | 'return'
  | 'return_to_sender'
  | 'unfound'
  | 'repair_service';

export type ClaimSeverity = 'low' | 'medium' | 'high';

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  damage: 'Damage',
  missing: 'Missing item',
  wrong_item: 'Wrong item',
  vendor_defect: 'Vendor defect',
  return: 'Return',
  return_to_sender: 'Return to sender',
  unfound: 'Unfound — no PO match',
  repair_service: 'Repair service',
};

/**
 * The picker's groups (owner 2026-09-28: every ticket says whether it is an
 * investigation or a claim). `Other` types record no exception.
 */
export const CLAIM_TYPE_FAMILY: Record<ClaimType, 'Investigation' | 'Vendor claim' | 'Other'> = {
  unfound: 'Investigation',
  return: 'Investigation',
  damage: 'Vendor claim',
  missing: 'Vendor claim',
  wrong_item: 'Vendor claim',
  vendor_defect: 'Vendor claim',
  return_to_sender: 'Other',
  repair_service: 'Other',
};

/**
 * The exception code a ticket filed under `type` records. A return is an
 * investigation only while the carton has no order to pair it to; return to
 * sender and repair service are routing, not a reason — null (no row).
 */
export function claimTypeExceptionCode(
  type: ClaimType,
  carton: { hasOrder: boolean },
): ReceivingExceptionCode | null {
  switch (type) {
    case 'unfound': return 'NO_PO';
    case 'return': return carton.hasOrder ? null : 'RETURN_NO_ORDER';
    case 'damage': return 'DAMAGED';
    case 'missing': return 'SHORT';
    case 'wrong_item': return 'WRONG_ITEM';
    case 'vendor_defect': return 'DEFECTIVE';
    case 'return_to_sender':
    case 'repair_service':
      return null;
  }
}

/**
 * Pick the default claim type for a receiving carton/line row.
 *
 * Priority: carrier RETURNED (RTS) → customer return intake → unmatched w/o PO
 * → QC fail → short line → damage. `return` and `return_to_sender` are
 * distinct jobs — do not overload.
 */
export function defaultReceivingClaimType(input: {
  shipmentStatus?: string | null;
  receivingType?: string | null;
  cartonIntakeType?: string | null;
  intakeType?: string | null;
  receivingSource?: string | null;
  hasPo: boolean;
  /** `qa_status` — a FAILED_* verdict seeds its claim. */
  qaStatus?: string | null;
  quantityReceived?: number | null;
  quantityExpected?: number | null;
}): ClaimType {
  if (String(input.shipmentStatus || '').toUpperCase() === 'RETURNED') {
    return 'return_to_sender';
  }
  const isReturnIntake =
    input.receivingType === 'RETURN' ||
    input.cartonIntakeType === 'RETURN' ||
    input.intakeType === 'return';
  if (isReturnIntake) return 'return';
  if (input.receivingSource === 'unmatched' && !input.hasPo) return 'unfound';
  const qa = String(input.qaStatus || '').toUpperCase();
  if (qa === 'FAILED_DAMAGED') return 'damage';
  if (qa.startsWith('FAILED_')) return 'vendor_defect';
  if (
    input.quantityExpected != null &&
    Number(input.quantityReceived ?? 0) < input.quantityExpected
  ) {
    return 'missing';
  }
  return 'damage';
}
