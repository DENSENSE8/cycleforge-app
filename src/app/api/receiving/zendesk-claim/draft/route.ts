/**
 * POST /api/receiving/zendesk-claim/draft
 *
 * Rewrites the receiving-claim ticket template via the local Hermes agent.
 * Nothing is filed — the create-ticket surface reviews the draft first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/zendesk-claim-template';
import { poReceivingLink } from '@/lib/receiving-claim-photos';
import { draftReceivingClaimTicket } from '@/lib/receiving/draft-receiving-claim-ticket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DraftRequest {
  receivingId: number;
  lineId?: number | null;
  claimType: ClaimType;
  reason?: string;
  subject?: string;
  description?: string;
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

    const draft = await draftReceivingClaimTicket(ctx.organizationId, {
      receivingId,
      lineId: body.lineId != null ? Number(body.lineId) : null,
      claimType: body.claimType,
      reason: body.reason,
      subject: body.subject,
      description: body.description,
      poReceivingLink: poReceivingLink(req, receivingId),
    });

    return NextResponse.json({ success: true, ai: true, ...draft });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving/zendesk-claim/draft');
  }
}, { permission: 'receiving.mark_received' });
