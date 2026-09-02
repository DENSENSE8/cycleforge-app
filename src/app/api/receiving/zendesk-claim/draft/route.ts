/**
 * POST /api/receiving/zendesk-claim/draft
 *
 * Builds the deterministic claim template (PO, tracking, serials, issue) and
 * asks Hermes to rewrite it into the operator-facing subject + body.
 * Nothing is filed. Station Ticket mode lands this text in the Omni Composer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/zendesk-claim-template';
import { poReceivingLink } from '@/lib/receiving-claim-photos';
import { buildReceivingClaimTemplate } from '@/lib/zendesk-claim-template';
import { draftReceivingClaimWithLlm } from '@/lib/receiving/draft-receiving-claim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DraftRequest {
  receivingId: number;
  lineId?: number | null;
  claimType: ClaimType;
  reason?: string;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = (await req.json().catch(() => null)) as DraftRequest | null;
    if (!body) throw ApiError.badRequest('Missing body');

    const receivingId = Number(body.receivingId);
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      throw ApiError.badRequest('Valid receivingId is required');
    }
    if (!body.claimType || !(body.claimType in CLAIM_TYPE_LABEL)) {
      throw ApiError.badRequest('Invalid claimType');
    }
    const lineId = body.lineId != null ? Number(body.lineId) : null;

    const result = await draftReceivingClaimWithLlm(ctx.organizationId, {
      receivingId,
      lineId,
      claimType: body.claimType,
      reason: body.reason,
      poReceivingLink: poReceivingLink(req, receivingId),
    }, { buildTemplate: buildReceivingClaimTemplate });

    return NextResponse.json({
      success: true,
      subject: result.subject,
      description: result.description,
      model: result.model,
      degraded: result.degraded,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving/zendesk-claim/draft');
  }
}, { permission: 'receiving.mark_received' });
