/** Pickup sign-off rules for the desk flow (`RepairPickupFlow`), kept pure so the one write it feeds ({@link submitRepairPickup}) can only… */

import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { RepairReceiptProps } from '@/lib/repair/repair-intake-receipt';
import type { RepairPickupInput } from '@/lib/repair/pickup-submit';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { formatPhoneNumber } from '@/utils/phone';

/** Preset answers to "why is there no signature?" — the decline step's chips. */
export const PICKUP_DECLINE_REASONS = [
  'Refused to sign',
  'Unable to sign',
  'Left before signing',
] as const;

export type PickupDeclineReason = (typeof PICKUP_DECLINE_REASONS)[number];

/** Upper bound on the typed detail — one audit-trail sentence, not an essay. */
export const PICKUP_DECLINE_DETAIL_MAX = 300;

/**
 * The recorded decline sentence. A chip alone, detail alone, or `chip — detail`.
 * `null` when there is nothing to record (no chip, blank detail).
 */
export function composeDeclinedReason(
  choice: PickupDeclineReason | null,
  detail: string,
): string | null {
  const note = detail.trim().slice(0, PICKUP_DECLINE_DETAIL_MAX);
  if (choice && note) return `${choice} — ${note}`;
  return choice ?? (note || null);
}

export type PickupSignoffOutcome =
  | { ok: true; input: RepairPickupInput }
  | { ok: false; reason: string };

/**
 * The submit body, or the ONE sentence saying why it cannot be sent yet.
 * `declinedReason` wins only when there is no signature: the flow clears the
 * other path when it switches, so both present is a caller bug and refused.
 */
export function pickupSignoffInput(args: {
  repairId: number;
  signerName: string;
  signature: { dataUrl: string; strokes: unknown[] } | null;
  declinedReason: string | null;
}): PickupSignoffOutcome {
  const signer = args.signerName.trim();
  if (!signer) return { ok: false, reason: 'Enter who is collecting the repair.' };
  const declined = args.declinedReason?.trim() || null;
  if (args.signature && declined) {
    return { ok: false, reason: 'A signed pickup cannot also be declined.' };
  }
  if (!args.signature && !declined) {
    return { ok: false, reason: 'Capture a signature or record why there is none.' };
  }
  return {
    ok: true,
    input: {
      repairId: args.repairId,
      signerName: signer,
      signature: args.signature,
      declinedReason: args.signature ? null : declined,
    },
  };
}

/** One row of `GET /api/repair-service/document/[id]`. */
export interface RepairDocumentRow {
  document_type: string | null;
  signature_url: string | null;
}

/**
 * The drop-off ink the printed sheet carries. Rows arrive newest-first; intake
 * rows that predate `document_type` are NULL (same rule as the print route).
 */
export function intakeSignatureUrl(documents: readonly RepairDocumentRow[]): string | null {
  for (const doc of documents) {
    const intake = doc.document_type === 'intake_agreement' || doc.document_type == null;
    const url = doc.signature_url?.trim();
    if (intake && url) return url;
  }
  return null;
}

/**
 * The stored repair as `RepairServiceForm` facts — the same values the print
 * route renders (`render-repair-paper.ts`): contact via the shared rule, phone
 * formatted, intake date as `MM/DD/YYYY`.
 */
export function pickupReviewPaperwork(
  repair: Pick<
    RSRecord,
    | 'ticket_number'
    | 'product_title'
    | 'issue'
    | 'serial_number'
    | 'price'
    | 'created_at'
    | 'contact_info'
    | 'customer_name'
    | 'customer_phone'
    | 'customer_email'
  >,
): RepairReceiptProps {
  const contact = resolveRepairContact(repair);
  const created = repair.created_at ? new Date(repair.created_at) : new Date();
  const startDate = Number.isNaN(created.getTime()) ? new Date() : created;
  return {
    ticketNumber: repair.ticket_number || '',
    productTitle: repair.product_title || '',
    issue: repair.issue || '',
    serialNumber: repair.serial_number || '',
    name: contact.name ?? '',
    contact: [formatPhoneNumber(contact.phone ?? ''), contact.email ?? '']
      .filter(Boolean)
      .join(', '),
    price: repair.price || '',
    startDateTime: startDate.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }),
  };
}
