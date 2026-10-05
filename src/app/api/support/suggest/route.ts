/**
 * POST /api/support/suggest — the station composer's "Draft with AI".
 *
 * Body `{ ticketId, stagedPhotoIds? }`, where `ticketId` is the helpdesk
 * ticket number the station shows. The ticket is mapped to its LOCAL Support
 * item and drafted from the local conversation and linked records only — no
 * provider read. The draft is stored on the item like any other (never sent)
 * and returned in the station's response shape. A conversation that is not an
 * acknowledged customer conversation is refused with `422 { error, reason }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { MAX_STAGED_DRAFT_PHOTOS } from '@/lib/schemas/support-drafts';
import { syncSupportThreadFromMirror } from '@/lib/support/conversation/mirror-bridge';
import { readStationSupportItem } from '@/lib/support/drafts/context-read';
import { draftSupportItemNow } from '@/lib/support/drafts/process';

export const runtime = 'nodejs';

type SuggestBody = {
  ticketId?: number;
  stagedPhotoIds?: unknown;
};

function readPhotoIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= MAX_STAGED_DRAFT_PHOTOS) break;
  }
  return out;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'support-suggest',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId, staffId: ctx.staffId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined },
    );
  }

  const body = (await req.json().catch(() => ({}))) as SuggestBody;
  const ticketId = Number(body.ticketId);
  const stagedPhotoIds = readPhotoIds(body.stagedPhotoIds);

  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
  }

  const item = await readStationSupportItem(ctx.organizationId, ticketId);
  if (!item) {
    return NextResponse.json({ error: `Ticket #${ticketId} not found` }, { status: 404 });
  }
  // A mirrored ticket whose canonical thread was never filled: fill it from the
  // LOCAL mirror first (backfill mode — no alerts, no queued drafts).
  if (item.needsMirrorSync) {
    await syncSupportThreadFromMirror(ctx.organizationId, item.supportItemId, { mode: 'backfill' });
  }

  const result = await draftSupportItemNow(ctx.organizationId, item.supportItemId, ctx.staffId, { stagedPhotoIds });
  if (!result.ok) {
    if (result.status === 502) console.error('[support/suggest]', result.status, result.error);
    return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  }
  return NextResponse.json({ success: true, ...result.suggestion, draftId: result.draft.id });
}, { permission: 'integrations.zendesk', feature: 'support' });
