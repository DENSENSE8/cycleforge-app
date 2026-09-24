/**
 * The ONE client write path for a repair pickup. Desk (`RepairPickupFlow`)
 * and phone (`RepairPickupSheet`) both call {@link submitRepairPickup}, so
 * the body the server sees — and the terms the customer read — cannot drift
 * between surfaces.
 *
 * Server: `POST /api/repair-service/pickup` (closes the repair as Done,
 * stamps pickup time, closes the work assignment, stores the signed or
 * declined `pickup_agreement` document).
 *
 * Callers: `src/components/repair/RepairPickupFlow.tsx`,
 * `src/components/mobile/repair/RepairPickupSheet.tsx`.
 */

/**
 * What the customer agrees to by signing. The server stamps the same sentence
 * into the stored document (`api/repair-service/pickup/route.ts`).
 */
export const PICKUP_TERMS =
  'I confirm I am picking up this repaired item and acknowledge the 30-day warranty on the repair.';

export interface RepairPickupInput {
  repairId: number;
  /** Who collected — the customer or their representative. */
  signerName: string | null;
  /** `null` when the customer declined to sign. */
  signature: { dataUrl: string; strokes: unknown[] } | null;
  /** Required by the caller when `signature` is null; recorded in the audit trail. */
  declinedReason: string | null;
}

/** Success body of `POST /api/repair-service/pickup`. */
export interface RepairPickupResult {
  success: true;
  repairId: number;
  ticketNumber: string | null;
  status: 'Done';
  previousStatus: string | null;
  assignmentId: number | null;
  /** The repair was already Done before this call. */
  alreadyDone: boolean;
  documentId: number | null;
  signatureUrl: string | null;
  /** Non-fatal: the pickup landed but the signature image/document did not. */
  signatureWarning: string | null;
  declined: boolean;
}

export async function submitRepairPickup(input: RepairPickupInput): Promise<RepairPickupResult> {
  const response = await fetch('/api/repair-service/pickup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repairId: input.repairId,
      signatureDataUrl: input.signature?.dataUrl ?? null,
      signatureStrokes: input.signature?.strokes ?? null,
      signerName: input.signerName,
      declinedReason: input.declinedReason,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.details || result?.error || 'Pickup failed');
  }
  return result as RepairPickupResult;
}
