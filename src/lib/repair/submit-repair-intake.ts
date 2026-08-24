/**
 * submitRepairIntake — the repair-intake create path as a principal-agnostic
 * domain helper.
 *
 * Everything here is scoped by `orgId` + the submitted body; NOTHING depends on
 * a staff actor. That is deliberate: the staff route (`/api/repair/submit`,
 * `withAuth` + `repair.intake`) calls this one helper rather than inlining the
 * work, so any future intake surface shares one code path. (A headless kiosk
 * route was the second caller until the kiosk product was removed 2026-08-22.)
 * Extracting the former inline route body into this helper is the route →
 * domain-helper pattern from `.claude/rules/backend-patterns.md`.
 *
 * Validation failures throw `RepairIntakeValidationError` (callers map → 400);
 * any other throw is an internal error (callers map → 500).
 */

import { createRepair } from '@/lib/neon/repair-service-queries';
import { createAssignment } from '@/lib/neon/assignments-queries';
import { addBusinessDays } from '@/lib/zendesk';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { formatPSTTimestamp } from '@/utils/date';
import { findOrCreateRepairCustomer, linkCustomerToRepair } from '@/lib/neon/customer-queries';
import { put } from '@vercel/blob';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  createRepairIntakeTicket,
  type RepairIntakeTicketWork,
} from '@/lib/repair/create-repair-intake-ticket';

interface SubmitRepairIntakeInput {
  customer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  product?: { type?: string | null; model?: string | null; sourceSku?: string | null } | null;
  repairReasons?: unknown;
  repairNotes?: unknown;
  serialNumber?: unknown;
  price?: unknown;
  notes?: unknown;
  assignedTechId?: unknown;
  signatureDataUrl?: string | null;
  signatureStrokes?: unknown;
  /** Dedupes the helpdesk ticket if the request is replayed. */
  idempotencyKey?: string;
  /**
   * `'create'` (default) — immediate helpdesk create + outbox fallback.
   * `'skip'` — counter owns enqueue via ticket_work_outbox (avoids double create).
   */
  ticketWork?: RepairIntakeTicketWork;
}

export interface SubmitRepairIntakeResult {
  success: true;
  rsNumber: string;
  id: number;
  zendeskTicketNumber: string | null;
  zendeskTicketUrl: string | null;
  customerId: number;
  documentId: number | null;
  signatureUrl: string | null;
  signatureWarning: string | null;
  /** Non-fatal helpdesk warning when create was deferred or failed. */
  ticketWarning: string | null;
}

/** Thrown when required intake fields are missing — callers map this to HTTP 400. */
export class RepairIntakeValidationError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing required fields: ${missing.join(', ')}`);
    this.name = 'RepairIntakeValidationError';
    this.missing = missing;
  }
}

export async function submitRepairIntake(
  input: SubmitRepairIntakeInput,
  orgId: OrgId,
): Promise<SubmitRepairIntakeResult> {
  const {
    customer,
    product,
    repairReasons,
    repairNotes,
    serialNumber,
    price,
    notes,
    assignedTechId,
    signatureDataUrl,
    signatureStrokes,
    idempotencyKey,
    ticketWork,
  } = input;

  const normalizedProductTitle = String(product?.model || '').trim();
  const normalizedReasons = Array.isArray(repairReasons)
    ? repairReasons.map((reason: unknown) => String(reason || '').trim()).filter(Boolean)
    : [];
  const normalizedRepairNotes = String(repairNotes || '').trim();
  const normalizedSerialNumber = String(serialNumber || '').trim();
  const normalizedPrice = String(price || '').trim();
  const normalizedNotes = String(notes || '').trim();
  const normalizedSourceSku = String(product?.sourceSku || '').trim();
  const techId = assignedTechId ? Number(assignedTechId) : null;

  // Validate required fields (email is optional)
  if (
    !customer?.name ||
    !customer?.phone ||
    !normalizedProductTitle ||
    (!normalizedReasons.length && !normalizedRepairNotes) ||
    !normalizedSerialNumber ||
    !normalizedPrice
  ) {
    const missing: string[] = [];
    if (!customer?.name) missing.push('Name');
    if (!customer?.phone) missing.push('Phone');
    if (!normalizedProductTitle) missing.push('Product Title');
    if (!normalizedReasons.length && !normalizedRepairNotes) missing.push('Repair Reason or Notes');
    if (!normalizedSerialNumber) missing.push('Serial #');
    if (!normalizedPrice) missing.push('Price');
    throw new RepairIntakeValidationError(missing);
  }

  const postedAt = formatPSTTimestamp();

  // Calculate the 5-business-day repair deadline (same value sent to Zendesk).
  const deadlineAt = addBusinessDays(new Date(), 5).toISOString().slice(0, 10);

  const productString = normalizedProductTitle;

  // Format contact info (email is optional) — kept for backward compatibility
  const contactInfo = customer.email
    ? `${customer.name}, ${customer.phone}, ${customer.email}`
    : `${customer.name}, ${customer.phone}`;

  // Format issue (repair reasons + repair notes from step 2)
  const issueString =
    normalizedReasons.join(', ') +
    (normalizedRepairNotes ? `${normalizedReasons.length ? ' - ' : ''}${normalizedRepairNotes}` : '');

  // Step 1: Find or create customer record
  const customerRecord = await findOrCreateRepairCustomer(
    {
      name: customer.name,
      phone: customer.phone,
      email: customer.email || undefined,
    },
    orgId,
  );

  // Step 2: Create repair row with customer_id FK
  const repairRecord = await createRepair(
    {
      createdAt: postedAt,
      ticketNumber: null,
      contactInfo,
      productTitle: productString,
      price: normalizedPrice,
      issue: issueString,
      serialNumber: normalizedSerialNumber,
      notes: normalizedNotes || null,
      sourceSystem: normalizedSourceSku ? 'ecwid' : null,
      sourceSku: normalizedSourceSku || null,
      customerId: customerRecord.id,
    },
    orgId,
  );

  const dbId = repairRecord.id;
  const finalRSNumber = repairRecord.ticket_number;

  // Link customer entity_id to this repair (if newly created)
  await linkCustomerToRepair(customerRecord.id, dbId, orgId);

  // Step 3: Upload signature to Vercel Blob + create document record
  // Primary: JSON stroke data stored in document_data (always saved)
  // Secondary: PNG uploaded to blob for quick viewing
  let signatureUrl: string | null = null;
  let signatureWarning: string | null = null;
  let documentId: number | null = null;

  const hasSignature =
    !!signatureDataUrl && typeof signatureDataUrl === 'string' && signatureDataUrl.startsWith('data:image/');

  if (hasSignature) {
    // Upload PNG to Vercel Blob
    try {
      const base64Data = signatureDataUrl!.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const blobPath = `repair_signatures/${finalRSNumber}_${Date.now()}.png`;

      const blob = await put(blobPath, buffer, {
        access: 'public',
        contentType: 'image/png',
      });
      signatureUrl = blob.url;
    } catch (sigError) {
      console.error('Failed to upload signature PNG to blob:', sigError);
      signatureWarning = 'Signature image upload failed — stroke data saved as backup';
    }
  }

  // Always create document record if we have signature data (strokes or PNG)
  if (hasSignature || (Array.isArray(signatureStrokes) && signatureStrokes.length > 0)) {
    try {
      const docResult = await tenantQuery(
        orgId,
        `INSERT INTO documents (
                        entity_type, entity_id, document_type, signature_url, signer_name, signed_at, document_data, organization_id
                    ) VALUES ('REPAIR', $1, 'intake_agreement', $2, $3, NOW(), $4, $5::uuid)
                    RETURNING id`,
        [
          dbId,
          signatureUrl,
          customer.name,
          JSON.stringify({
            ticketNumber: finalRSNumber,
            product: productString,
            serialNumber: normalizedSerialNumber,
            issue: issueString,
            price: normalizedPrice,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email || null,
            signatureStrokes: Array.isArray(signatureStrokes) ? signatureStrokes : null,
            terms:
              'Your Bose product has been received into our repair center. Under normal circumstances it will be repaired within the next 3-10 working days. There is a 30 day Warranty on all our repair services.',
            signedAt: new Date().toISOString(),
          }),
          orgId,
        ],
      );
      documentId = docResult.rows[0]?.id ?? null;
    } catch (docError) {
      console.error('Failed to create document record:', docError);
      signatureWarning = 'Failed to save signed document';
    }
  }

  // Step 4: Create helpdesk ticket via the capability facade (claim parity).
  // Never blocks intake — failures enqueue CREATE_TICKET for retry. Counter
  // passes ticketWork: 'skip' because it owns the outbox enqueue itself.
  const ticketResult = await createRepairIntakeTicket({
    orgId,
    repairServiceId: dbId,
    repairServiceNumber: finalRSNumber,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email || '',
    productTitle: productString,
    contactInfo,
    issue: issueString,
    serialNumber: normalizedSerialNumber,
    price: normalizedPrice,
    notes: normalizedNotes,
    idempotencyKey,
    ticketWork,
  });
  const zendeskTicketNumber = ticketResult.zendeskTicketNumber;
  const ticketWarning = ticketResult.ticketWarning;

  // Step 5: Insert work_assignment
  try {
    await createAssignment({
      organizationId: orgId,
      entityType: 'REPAIR',
      entityId: dbId,
      workType: 'REPAIR',
      assignedTechId: techId,
      status: 'ASSIGNED',
      deadlineAt,
    });
  } catch (waErr) {
    console.warn('work_assignments insert skipped (constraint or missing):', waErr);
  }

  // Invalidate repair cache
  await invalidateCacheTags(['repair-service']);
  await publishRepairChanged({ organizationId: orgId, repairIds: [Number(dbId)], source: 'repair.submit' });

  return {
    success: true,
    rsNumber: finalRSNumber,
    id: dbId,
    zendeskTicketNumber,
    zendeskTicketUrl: zendeskTicketUrl(zendeskTicketNumber),
    customerId: customerRecord.id,
    documentId,
    signatureUrl,
    signatureWarning,
    ticketWarning,
  };
}
