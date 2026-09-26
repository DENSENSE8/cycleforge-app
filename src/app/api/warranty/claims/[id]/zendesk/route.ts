import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { getClaim, getClaimTicketRef } from '@/lib/warranty/claims';
import { buildWarrantyTicketTemplate } from '@/lib/warranty/zendesk-format';
import { recordClaimTicketLink } from '@/lib/warranty/zendesk-link';
import { claimIdFromPath, idempotentJson, warrantyFlagEnabled, warrantyFlagOff } from '@/lib/warranty/route-helpers';
import { WarrantyZendeskTicketBody } from '@/lib/schemas/warranty';
import {
  createTicket,
  getTicket,
  ZendeskApiError,
  ZendeskNotConfiguredError,
} from '@/lib/zendesk';
import { buildExternalId } from '@/lib/zendesk-links';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { pairTicketShipmentIfKnown } from '@/lib/support/ticket-link';

export const dynamic = 'force-dynamic';

/** GET /api/warranty/claims/[id]/zendesk */
export const GET = withAuth(async (request, ctx) => {
  if (!warrantyFlagEnabled()) return warrantyFlagOff();
  const id = claimIdFromPath(request, 2);
  if (id == null) return NextResponse.json({ ok: false, error: 'invalid claim id' }, { status: 400 });

  try {
    const claim = await getClaimTicketRef(id, ctx.organizationId);
    if (!claim) return NextResponse.json({ ok: false, error: 'claim not found' }, { status: 404 });
    if (!claim.zendeskTicketId) {
      return NextResponse.json({ ok: true, ticket: null, ticketUrl: null });
    }
    const ticket = await getTicket(claim.zendeskTicketId, ctx.organizationId);
    return NextResponse.json({
      ok: true,
      ticket: ticket
        ? {
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority,
            updatedAt: ticket.updated_at,
          }
        : null,
      ticketUrl: zendeskTicketUrl(String(claim.zendeskTicketId)),
    });
  } catch (err) {
    if (err instanceof ZendeskNotConfiguredError) {
      return NextResponse.json({ ok: false, error: 'Zendesk is not configured' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'zendesk ticket lookup failed';
    console.error('[GET /api/warranty/claims/[id]/zendesk] error:', err);
    const status = err instanceof ZendeskApiError ? 502 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}, { permission: 'warranty.view', feature: 'repair' });

/** POST /api/warranty/claims/[id]/zendesk */
export const POST = withAuth(async (request, ctx) => {
  if (!warrantyFlagEnabled()) return warrantyFlagOff();
  const id = claimIdFromPath(request, 2);
  if (id == null) return NextResponse.json({ ok: false, error: 'invalid claim id' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = WarrantyZendeskTicketBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return idempotentJson({
    request,
    staffId: ctx.staffId ?? null,
    orgId: ctx.organizationId,
    route: 'POST /api/warranty/claims/[id]/zendesk',
    bodyKey: parsed.data.idempotencyKey ?? null,
    produce: async () => {
      const claim = await getClaim(id, ctx.organizationId);
      if (!claim) return { status: 404, body: { ok: false, error: 'claim not found' } };
      if (claim.zendeskTicketId) {
        return {
          status: 409,
          body: {
            ok: false,
            error: `claim is already linked to Zendesk ticket #${claim.zendeskTicketId}`,
            ticketId: claim.zendeskTicketId,
            ticketUrl: zendeskTicketUrl(String(claim.zendeskTicketId)),
          },
        };
      }

      const template = buildWarrantyTicketTemplate(claim);
      const subject = parsed.data.subject || template.subject;
      const description = parsed.data.description || template.description;

      let ticket;
      try {
        ticket = await createTicket(
          {
            subject,
            comment: { body: description, public: false },
            type: 'task',
            tags: ['warranty_claim', claim.claimNumber.toLowerCase()],
            external_id: buildExternalId('WARRANTY_CLAIM', claim.id),
          },
          { idempotencyKey: parsed.data.idempotencyKey ?? undefined },
          ctx.organizationId,
        );
      } catch (err) {
        if (err instanceof ZendeskNotConfiguredError) {
          return {
            status: 503,
            body: { ok: false, error: 'Zendesk is not configured', draftSubject: subject, draftBody: description },
          };
        }
        return {
          status: 502,
          body: {
            ok: false,
            error: err instanceof Error ? err.message : 'Zendesk request failed',
            draftSubject: subject,
            draftBody: description,
          },
        };
      }

      await recordClaimTicketLink({
        claimId: claim.id,
        zendeskTicketId: ticket.id,
        organizationId: ctx.organizationId,
        actorStaffId: ctx.staffId ?? null,
      });

      if (claim.sourceTrackingNumber) {
        try {
          await pairTicketShipmentIfKnown({
            orgId: ctx.organizationId,
            ticketId: ticket.id,
            trackingNumber: claim.sourceTrackingNumber,
            staffId: ctx.staffId ?? null,
          });
        } catch (pairErr) {
          console.warn('[POST /api/warranty/claims/[id]/zendesk] STN pair failed', pairErr);
        }
      }

      await recordAudit(pool, ctx, request, {
        source: 'warranty-logger',
        action: 'warranty.zendesk_create',
        entityType: 'warranty_claim',
        entityId: claim.id,
        after: { zendeskTicketId: ticket.id, subject },
      });

      // Patch in memory rather than re-running getClaim's 4-query fan-out —
      // the mutation only changed the linkage column.
      return {
        status: 201,
        body: {
          ok: true,
          ticketId: ticket.id,
          ticketUrl: zendeskTicketUrl(String(ticket.id)),
          claim: { ...claim, zendeskTicketId: ticket.id },
        },
      };
    },
  });
}, { permission: 'warranty.manage', feature: 'repair' });
