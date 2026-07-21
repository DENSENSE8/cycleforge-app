/**
 * Receiving claim type vocabulary + defaulting.
 *
 * Leaf SoT — no DB / server-only imports so UI + unit tests can share it.
 * Template body builders stay in `zendesk-claim-template.ts` and re-export these.
 */

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
 * Pick the default claim type for a receiving carton/line row.
 *
 * Priority: carrier RETURNED (RTS) → customer return intake → unmatched w/o PO
 * → damage. `return` and `return_to_sender` are distinct jobs — do not overload.
 */
export function defaultReceivingClaimType(input: {
  shipmentStatus?: string | null;
  receivingType?: string | null;
  cartonIntakeType?: string | null;
  intakeType?: string | null;
  receivingSource?: string | null;
  hasPo: boolean;
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
  return 'damage';
}
