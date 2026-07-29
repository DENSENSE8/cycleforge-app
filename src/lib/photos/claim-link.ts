/**
 * Claim dual-linking + the secondary link-role vocabulary.
 *
 * `link_role` is a closed set (`PHOTO_LINK_ROLES`, `./types.ts`) — free-text
 * roles are banned; pick by destination, never invent a new string inline:
 *
 * - `claim_evidence`  — dual-link onto the `ZENDESK_TICKET` of a filed claim
 *   (this module + `zendesk-claim/route.ts`): the dispute-evidence trail the
 *   helpdesk path reads. Evidence preference is line-first — `unbox_item`
 *   shots prove the item's condition; arrival `receiving_package` shots are
 *   the add-on for outer/shipping-damage claims (Plan 5).
 * - `insurance_share` — carrier / external share packs (`./share-packs.ts`):
 *   photos bundled for an outside insurance or carrier audience via signed
 *   share links, NOT part of the Zendesk claim trail.
 * - `primary`         — the photo's owning entity link; never used for these
 *   secondary claim/share links.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import { linkPhoto } from './service';
import type { PhotoEntityType } from './types';

/** Parse a "#9518"-style Zendesk ticket ref into a positive numeric id, or null. */
export function parseZendeskTicketId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw).replace(/^#/, '').trim();
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the Zendesk claim ticket for a receiving carton/line, if the carton was
 * claimed. A line-level claim (`receiving_line.zendesk_ticket`) wins over the
 * carton-level one; a line with no claim of its own falls back to its carton.
 */
async function resolveReceivingClaimTicketId(
  organizationId: string,
  entityType: 'RECEIVING' | 'RECEIVING_LINE',
  entityId: number,
): Promise<number | null> {
  if (entityType === 'RECEIVING_LINE') {
    const res = await tenantQuery<{ zendesk_ticket: string | null; receiving_id: number | null }>(
      organizationId,
      `SELECT zendesk_ticket, receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [entityId, organizationId],
    );
    const row = res.rows[0];
    const lineTicket = parseZendeskTicketId(row?.zendesk_ticket);
    if (lineTicket) return lineTicket;
    if (row?.receiving_id) {
      return resolveReceivingClaimTicketId(organizationId, 'RECEIVING', row.receiving_id);
    }
    return null;
  }
  const res = await tenantQuery<{ zendesk_ticket: string | null }>(
    organizationId,
    `SELECT zendesk_ticket FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [entityId, organizationId],
  );
  return parseZendeskTicketId(res.rows[0]?.zendesk_ticket);
}

/**
 * After an unbox/receiving photo is attached to its PO (RECEIVING /
 * RECEIVING_LINE), ALSO link it to the carton's Zendesk claim (as
 * `claim_evidence`) when the carton has been claimed — so a photo taken *after* a
 * claim is filed still lands under the same claim umbrella, not the PO only. This
 * mirrors the link the claim-filing flow writes for photos that existed at filing
 * time (see `zendesk-claim/route.ts`, `zendesk-attachments.ts`).
 *
 * Best-effort: a failure here never fails the upload — the primary PO link is
 * already committed. Returns the linked ticket id, or null when there's no claim.
 */
export async function linkReceivingPhotoToClaim(input: {
  organizationId: string;
  photoId: number;
  entityType: PhotoEntityType;
  entityId: number;
}): Promise<number | null> {
  if (input.entityType !== 'RECEIVING' && input.entityType !== 'RECEIVING_LINE') return null;
  try {
    const ticketId = await resolveReceivingClaimTicketId(
      input.organizationId,
      input.entityType,
      input.entityId,
    );
    if (!ticketId) return null;
    await linkPhoto({
      organizationId: input.organizationId,
      photoId: input.photoId,
      entityType: 'ZENDESK_TICKET',
      entityId: ticketId,
      linkRole: 'claim_evidence',
    });
    return ticketId;
  } catch (err) {
    console.error(
      '[photos/claim-link] failed to link photo to claim',
      { photoId: input.photoId, entityType: input.entityType, entityId: input.entityId },
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
