/**
 * POST /api/support/suggest — draft an AI support reply for a helpdesk ticket.
 *
 * Grounds the customer's question in the org's document RAG (NemoClaw), in what
 * any attached PHOTOS deterministically show, and in the rows those photos
 * resolve to in our own data. Returns the draft + typed sources + confidence;
 * the agent accepts/edits/sends it from the support console. This is a
 * generation (no state mutation), so — like /api/ai/chat — it writes no audit
 * row.
 *
 * ## The vision loop, and the trap in it
 *
 * `stagedPhotoIds` are photo IDs, never URLs. **The client never holds a model-
 * readable image URL and a model is never handed an app route.**
 * `/api/photos/[id]/content` 302s to a signed storage URL behind this app's
 * session cookie — a cloud model following it fetches a sign-in page and
 * describes that. This route resolves the signed URL itself
 * ({@link resolvePhotoAccessUrl}), and only on the lane that is allowed to send
 * one.
 *
 * The deterministic pass (analyze → `routeScan` → `hybridSearch`) runs on EVERY
 * lane, including local-only. It is what makes the photo searchable afterwards
 * and what lets the draft say *"this is the unit on order #1234"* rather than
 * describing a picture.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { resolvePhotoAccessUrl } from '@/lib/photos/resolve-access-url';
import { suggestSupportReply, SupportSuggestError } from '@/lib/support/suggest-reply';
import { resolveSupportReplyPersona } from '@/lib/support/reply-persona-deps';
import { collectPhotoEvidence, type PhotoEvidence } from '@/lib/support/photo-evidence';
import { supportPhotoEvidenceDeps } from '@/lib/support/photo-evidence-deps';
import { resolveSupportVisionLaneForOrg } from '@/lib/support/vision-lane-deps';

export const runtime = 'nodejs';

/** One paste is a handful of images, not an album. */
const MAX_STAGED_PHOTOS = 6;

type SuggestBody = {
  ticketId?: number;
  subject?: string;
  question?: string;
  stagedPhotoIds?: unknown;
};

function readPhotoIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= MAX_STAGED_PHOTOS) break;
  }
  return out;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'support-suggest',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined },
    );
  }

  const body = (await req.json().catch(() => ({}))) as SuggestBody;
  const ticketId = Number(body.ticketId);
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const stagedPhotoIds = readPhotoIds(body.stagedPhotoIds);

  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
  }
  // An image on its own IS a question ("what is this / is it covered"), so the
  // text is only required when nothing was attached.
  if (!question && !stagedPhotoIds.length) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  // Drafting a reply only makes sense against a connected helpdesk (the
  // capability gate, not a vendor check). Same 503 language as /api/zendesk/*.
  const helpdesk = await getHelpdeskProvider(ctx.organizationId);
  if (!helpdesk || !(await helpdesk.isConfigured())) {
    return NextResponse.json(
      { error: `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}` },
      { status: 503 },
    );
  }

  try {
    // The tenant's OWN framing — never a hardcoded brand. Degrades to the
    // generic "a reseller" clause rather than impersonating anyone.
    // The lane is resolved, never assumed, and it is local-first.
    const [persona, vision] = await Promise.all([
      resolveSupportReplyPersona(ctx.organizationId),
      resolveSupportVisionLaneForOrg(ctx.organizationId),
    ]);

    // Deterministic pass — every lane. A failure here degrades to a text-only
    // draft rather than failing the request: the record is never blocked by the
    // assistant, and the image is already attached to the ticket regardless.
    let evidence: PhotoEvidence[] = [];
    if (stagedPhotoIds.length) {
      try {
        evidence = await collectPhotoEvidence(
          stagedPhotoIds,
          supportPhotoEvidenceDeps(ctx.organizationId),
        );
      } catch (err) {
        console.warn('[support/suggest] photo evidence failed', (err as Error)?.message);
      }
    }

    // Signed STORAGE urls, resolved here and never returned to the client —
    // and only on the lane permitted to send an image off the tenant's box.
    let imageUrls: string[] = [];
    if (vision === 'cloud-multimodal' && evidence.length) {
      const resolved = await Promise.all(
        evidence.map((photo) =>
          resolvePhotoAccessUrl(photo.photoId, ctx.organizationId, 'full').catch(() => null),
        ),
      );
      // A fallback to the app content route is exactly what a model cannot
      // follow, so an unsigned URL is dropped rather than sent.
      imageUrls = resolved.filter(
        (url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url),
      );
    }

    const result = await suggestSupportReply(ctx.organizationId, {
      ticketId,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      question,
      persona,
      vision,
      photos: evidence,
      imageUrls,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof SupportSuggestError) {
      console.error('[support/suggest]', err.status, err.message, err.detail ?? '');
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[support/suggest] unexpected', (err as Error)?.message);
    return NextResponse.json({ error: 'Suggestion failed' }, { status: 503 });
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
