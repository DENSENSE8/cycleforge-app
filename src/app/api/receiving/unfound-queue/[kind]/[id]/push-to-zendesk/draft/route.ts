/** POST /api/receiving/unfound-queue/[kind]/[id]/push-to-zendesk/draft */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  ALLOWED_UNFOUND_KINDS,
  buildUnfoundTicket,
  loadUnfoundQueueRow,
  unfoundKindLabel,
  unfoundParamsFromUrl,
} from '@/lib/unfound-ticket';
import { draftTicketWithLlm } from '@/lib/ai/zendesk-ticket-draft';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DraftBody {
  /** Default true. When false, return the deterministic template only. */
  ai?: boolean;
}

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = unfoundParamsFromUrl(request.nextUrl);
  if (!parsed) {
    return NextResponse.json({ success: false, error: 'invalid path' }, { status: 400 });
  }
  const { kind, sourceId } = parsed;
  if (!ALLOWED_UNFOUND_KINDS.has(kind)) {
    return NextResponse.json({ success: false, error: `invalid kind: ${kind}` }, { status: 400 });
  }

  let body: DraftBody = {};
  try {
    body = ((await request.json().catch(() => ({}))) as DraftBody) ?? {};
  } catch {
    /* tolerate empty body */
  }
  const useAi = body.ai !== false;

  const row = await loadUnfoundQueueRow(ctx.organizationId, kind, sourceId);
  if (!row) {
    return NextResponse.json({ success: false, error: 'queue row not found' }, { status: 404 });
  }

  const template = buildUnfoundTicket(row);

  if (!useAi) {
    return NextResponse.json({
      success: true,
      ai: false,
      subject: template.subject,
      description: template.description,
    });
  }

  try {
    const draft = await draftTicketWithLlm(ctx.organizationId, {
      context: `Unfound item — ${unfoundKindLabel(kind)}`,
      template,
    });

    // Fact guard: the rewrite must keep the source Reference id.
    const ref = row.source_id?.trim();
    const keptRef = !ref || draft.description.includes(ref);
    if (!keptRef) {
      return NextResponse.json({
        success: true,
        ai: true,
        degraded: true,
        subject: template.subject,
        description: template.description,
        model: draft.model,
      });
    }

    return NextResponse.json({
      success: true,
      ai: true,
      degraded: false,
      subject: draft.subject,
      description: draft.description,
      model: draft.model,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'AI draft failed' },
      { status: 502 },
    );
  }
}, { permission: 'receiving.view' });
