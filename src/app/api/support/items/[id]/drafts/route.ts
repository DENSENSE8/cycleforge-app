/**
 * POST /api/support/items/[id]/drafts — "Draft with AI" now for a Support item.
 *
 * Body `{ stagedPhotoIds? }`. Drafts from the LOCAL conversation and its linked
 * records only, stores the draft on the item, and never sends. 422 `{ reason }`
 * for an internal record or an unclassified item (staff decide the purpose
 * first); 409 when a draft for the same message is already being written or a
 * newer message arrived meanwhile; 502 when the model failed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { SupportDraftNowBody } from '@/lib/schemas/support-drafts';
import { generateSupportDraftNow } from '@/lib/support/drafts/process';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'support.thread.manage');
  if (gate.denied) return gate.denied;
  const { ctx } = gate;

  const { id: rawId } = await params;
  const supportItemId = Number(rawId);
  if (!Number.isInteger(supportItemId) || supportItemId <= 0) {
    return NextResponse.json({ error: 'Invalid Support item id' }, { status: 400 });
  }

  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'support-draft',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
    staffId: ctx.staffId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(SupportDraftNowBody, raw ?? {});
  if (parsed instanceof NextResponse) return parsed;

  const result = await generateSupportDraftNow(ctx.organizationId, supportItemId, ctx.staffId, {
    stagedPhotoIds: parsed.stagedPhotoIds,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  }

  await recordAudit(pool, ctx, req, {
    source: 'support-drafts-api',
    action: AUDIT_ACTION.SUPPORT_DRAFT_GENERATE,
    entityType: AUDIT_ENTITY.SUPPORT_TICKET,
    entityId: supportItemId,
    after: {
      draftId: result.draft.id,
      kind: result.draft.kind,
      confidence: result.draft.confidence,
      model: result.draft.model,
      sourceMessageId: result.draft.sourceMessageId,
      warnings: result.draft.warnings.length,
    },
  });

  return NextResponse.json({ draft: result.draft });
}
