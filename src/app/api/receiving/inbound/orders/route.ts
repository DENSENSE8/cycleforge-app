/**
 * /api/receiving/inbound/orders — the one door for an inbound order.
 *
 *   POST   { draft, dryRun? }  dryRun → what landing it would do (never writes);
 *                              else → ingestInboundOrder (one transaction). A
 *                              RETURN also tags the return and files its claim.
 *   DELETE ?id=<inbound_order_id> → deleteInboundOrder (only before anything
 *                              physical happened).
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { readIdempotencyKey } from '@/lib/api-idempotency';
import { getHelpdeskProvider, HELPDESK_CONNECT_HINT, HELPDESK_NOT_CONNECTED_MESSAGE } from '@/lib/integrations/helpdesk';
import { fileReceivingClaim } from '@/lib/receiving/file-receiving-claim';
import { poReceivingLink } from '@/lib/receiving-claim-photos';
import { tagInboundAsReturn } from '@/lib/inbound/tag-inbound-return';
import { receiveImportedLineIfCartonUnboxed } from '@/lib/inbound/receive-if-carton-unboxed';
import {
  deleteInboundOrder,
  ingestInboundOrder,
  InboundOrderRefused,
  previewInboundOrder,
} from '@/lib/inbound/ingest-inbound-order';

const Body = z.object({
  draft: z.unknown(),
  dryRun: z.boolean().optional().default(false),
});

function refusal(err: unknown): NextResponse {
  if (err instanceof InboundOrderRefused) {
    return NextResponse.json({ success: false, error: err.message, missing: err.missing }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : 'inbound order failed';
  console.error('[inbound/orders]', err);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'body must be { draft, dryRun? }' }, { status: 400 });
  const { draft, dryRun } = parsed.data;

  if (dryRun) {
    try {
      return NextResponse.json({ success: true, preview: await previewInboundOrder(ctx.organizationId, draft) });
    } catch (err) {
      return refusal(err);
    }
  }

  const isReturn = (draft as { type?: unknown } | null)?.type === 'RETURN';
  if (isReturn && !ctx.permissions.has('receiving.mark_received')) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN', permission: 'receiving.mark_received' }, { status: 403 });
  }
  const helpdesk = isReturn ? await getHelpdeskProvider(ctx.organizationId) : null;
  if (isReturn && !helpdesk) {
    return NextResponse.json(
      { success: false, error: `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}` },
      { status: 503 },
    );
  }

  const idempotencyKey = readIdempotencyKey(request);
  let result;
  try {
    result = await ingestInboundOrder(ctx.organizationId, draft, {
      origin: 'manual',
      source: 'form',
      staffId: ctx.staffId,
      sourceEventId: idempotencyKey,
    });
  } catch (err) {
    return refusal(err);
  }

  let ticket: { success: boolean; ticketNumber?: string; ticketUrl?: string | null; error?: string; draftBody?: string } | null = null;
  if (isReturn && !result.unchanged) {
    const d = draft as { returnReason?: string; rmaId?: string; lines?: Array<{ listingUrl?: string }> };
    const line = result.lines[0];
    await tagInboundAsReturn(ctx.organizationId, {
      receivingLineId: line.receivingLineId,
      sourceType: result.identity.sourceType,
      sourceOrderId: result.identity.externalOrderId,
      returnReason: d.returnReason?.trim() || null,
      rmaRef: d.rmaId?.trim() || null,
    });
    await receiveImportedLineIfCartonUnboxed(ctx.organizationId, line.receivingLineId);
    if (result.receivingId != null && helpdesk) {
      const claim = await fileReceivingClaim(
        {
          orgId: ctx.organizationId,
          staffId: ctx.staffId,
          receivingId: result.receivingId,
          lineId: line.receivingLineId,
          claimType: 'return',
          reason: d.returnReason?.trim() || undefined,
          notePublic: false,
          poReceivingLink: poReceivingLink(request, result.receivingId),
          listingUrl: d.lines?.[0]?.listingUrl?.trim() || undefined,
          idempotencyKey,
        },
        { getHelpdesk: async () => helpdesk },
      );
      ticket = claim.success
        ? { success: true, ticketNumber: claim.ticketNumber, ticketUrl: claim.ticketUrl }
        : { success: false, error: claim.error, draftBody: claim.draftBody };
    }
  }

  if (!result.unchanged) {
    await recordAudit(pool, ctx, request, {
      source: 'inbound-orders',
      action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
      entityType: AUDIT_ENTITY.INBOUND_ORDER,
      entityId: result.inboundOrderId,
      method: 'manual',
      after: {
        identity: result.identity,
        created: result.created,
        lines: result.lines,
        receivingId: result.receivingId,
      },
    });
    after(async () => {
      await invalidateReceivingViews(ctx.organizationId).catch((e) => console.warn('[inbound/orders] invalidate failed', e));
    });
  }

  return NextResponse.json({ success: true, result, ticket }, { status: result.created ? 201 : 200 });
}, { permission: 'receiving.view' });

export const DELETE = withAuth(async (request: NextRequest, ctx) => {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, error: 'id must be an inbound order id' }, { status: 400 });
  }
  try {
    const result = await deleteInboundOrder(ctx.organizationId, id);
    await recordAudit(pool, ctx, request, {
      source: 'inbound-orders',
      action: AUDIT_ACTION.RECEIVING_INBOUND_ORDER_DELETE,
      entityType: AUDIT_ENTITY.INBOUND_ORDER,
      entityId: id,
      method: 'manual',
      before: { ...result },
    });
    after(async () => {
      await invalidateReceivingViews(ctx.organizationId).catch((e) => console.warn('[inbound/orders] invalidate failed', e));
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return refusal(err);
  }
}, { permission: 'receiving.mark_received' });
