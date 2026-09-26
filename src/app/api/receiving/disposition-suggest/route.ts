/** POST /api/receiving/disposition-suggest */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { classifyDispositionWithLlm } from '@/lib/receiving-disposition-classify-llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SuggestRequest {
  qaStatus?: string | null;
  conditionGrade?: string | null;
  notes?: string | null;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = (await req.json().catch(() => null)) as SuggestRequest | null;
    const qaStatus = body?.qaStatus ?? null;
    const conditionGrade = body?.conditionGrade ?? null;
    const notes = body?.notes ?? null;
    if (!String(qaStatus ?? '').trim() && !String(conditionGrade ?? '').trim() && !String(notes ?? '').trim()) {
      throw ApiError.badRequest('Provide at least a qaStatus, conditionGrade, or notes');
    }

    const result = await classifyDispositionWithLlm(ctx.organizationId, { qaStatus, conditionGrade, notes });
    return NextResponse.json({
      success: true,
      dispositionCode: result.dispositionCode,
      confidence: result.confidence,
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving/disposition-suggest');
  }
}, { permission: 'receiving.mark_received' });
