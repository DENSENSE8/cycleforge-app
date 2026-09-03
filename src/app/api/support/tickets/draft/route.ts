/**
 * POST /api/support/tickets/draft
 *
 * Hermes rewrite of a support create-ticket draft (subject + first note).
 * Nothing is filed — the operator reviews the result in the create form.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { draftTicketWithLlm } from '@/lib/ai/zendesk-ticket-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  context: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(300),
  description: z.string().trim().max(8000),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const subject = parsed.data.subject.trim();
    const description = parsed.data.description.trim();
    if (!subject && !description) {
      throw ApiError.badRequest('subject or description is required');
    }

    const draft = await draftTicketWithLlm(ctx.organizationId, {
      context: parsed.data.context?.trim() || 'Support ticket',
      template: {
        subject: subject || 'Support ticket',
        description: description || subject,
      },
    });

    return NextResponse.json({
      success: true,
      ai: true,
      subject: draft.subject,
      description: draft.description,
      model: draft.model,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/support/tickets/draft');
  }
}, { permission: 'integrations.zendesk' });
