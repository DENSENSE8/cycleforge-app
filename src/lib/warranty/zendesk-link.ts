/** Warranty ↔ Zendesk — server-side linking. */

import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { clearTicketExternalIdIfMatches, linkTicket, unlinkTicket } from '@/lib/zendesk-links';

/** Append a warranty_claim_events row outside the mutations.ts transaction helpers. */
export async function recordClaimZendeskEvent(args: {
  claimId: number;
  eventType:
    | 'ZENDESK_TICKET_CREATED'
    | 'ZENDESK_LINKED'
    | 'ZENDESK_UNLINKED'
    | 'ZENDESK_REPLY'
    | 'ZENDESK_STATUS';
  payload?: Record<string, unknown>;
  actorStaffId: number | null;
}): Promise<void> {
  await pool.query(
    // organization_id is derived from the parent claim so the row is org-stamped even on the raw (non-GUC) pool —…
    `INSERT INTO warranty_claim_events (claim_id, event_type, payload, actor_staff_id, organization_id)
     VALUES ($1, $2, $3::jsonb, $4,
       (SELECT organization_id FROM warranty_claims WHERE id = $1))`,
    [args.claimId, args.eventType, JSON.stringify(args.payload ?? {}), args.actorStaffId],
  );
}

/** Stamp a Zendesk ticket onto its claim. */
export async function recordClaimTicketLink(args: {
  claimId: number;
  zendeskTicketId: number;
  organizationId: string;
  actorStaffId: number | null;
  eventType?: 'ZENDESK_TICKET_CREATED' | 'ZENDESK_LINKED';
}): Promise<void> {
  const orgId: OrgId = args.organizationId || DOGFOOD_ORG_ID;
  await tenantQuery(
    orgId,
    `UPDATE warranty_claims
        SET zendesk_ticket_id = $2, updated_at = NOW()
      WHERE id = $1
        AND organization_id = $3`,
    [args.claimId, args.zendeskTicketId, orgId],
  );

  try {
    await linkTicket({
      orgId: args.organizationId,
      zendeskTicketId: args.zendeskTicketId,
      entityType: 'WARRANTY_CLAIM',
      entityId: args.claimId,
      staffId: args.actorStaffId,
    });
  } catch (err) {
    console.warn('[warranty.zendesk] ticket_links upsert failed', err);
  }

  try {
    await recordClaimZendeskEvent({
      claimId: args.claimId,
      eventType: args.eventType ?? 'ZENDESK_TICKET_CREATED',
      payload: { zendeskTicketId: args.zendeskTicketId },
      actorStaffId: args.actorStaffId,
    });
  } catch (err) {
    console.warn('[warranty.zendesk] timeline event insert failed', err);
  }
}

/** Detach a Zendesk ticket from a claim — the clean inverse of {@link recordClaimTicketLink}. */
export async function unlinkClaimTicket(args: {
  claimId: number;
  zendeskTicketId: number;
  organizationId: string;
  actorStaffId: number | null;
}): Promise<{ detached: boolean }> {
  const orgId: OrgId = args.organizationId || DOGFOOD_ORG_ID;
  const upd = await tenantQuery(
    orgId,
    `UPDATE warranty_claims
        SET zendesk_ticket_id = NULL, updated_at = NOW()
      WHERE id = $1 AND zendesk_ticket_id = $2
        AND organization_id = $3`,
    [args.claimId, args.zendeskTicketId, orgId],
  );
  const columnCleared = (upd.rowCount ?? 0) > 0;

  let linkRemoved = false;
  try {
    linkRemoved = await unlinkTicket({
      orgId: args.organizationId,
      zendeskTicketId: args.zendeskTicketId,
      entityType: 'WARRANTY_CLAIM',
      entityId: args.claimId,
    });
  } catch (err) {
    console.warn('[warranty.zendesk] ticket_links delete failed', err);
  }

  // Clear the dangling external_id (only when it still points at this claim).
  await clearTicketExternalIdIfMatches({
    orgId: args.organizationId,
    zendeskTicketId: args.zendeskTicketId,
    entityType: 'WARRANTY_CLAIM',
    entityId: args.claimId,
  });

  try {
    await recordClaimZendeskEvent({
      claimId: args.claimId,
      eventType: 'ZENDESK_UNLINKED',
      payload: { zendeskTicketId: args.zendeskTicketId },
      actorStaffId: args.actorStaffId,
    });
  } catch (err) {
    console.warn('[warranty.zendesk] timeline event insert failed', err);
  }

  return { detached: columnCleared || linkRemoved };
}
