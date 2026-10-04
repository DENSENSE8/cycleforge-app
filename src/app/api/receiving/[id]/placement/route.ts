/**
 * POST /api/receiving/[id]/placement — Arrival urgency-shelf placement.
 *
 *   { action: 'suggest' }  → which shelf this carton goes on (and why). Copies an
 *                            inbound-order / stock-out tier onto a carton that has none.
 *   { action: 'confirm', scanned, clientEventId?, mobileScanEventId?, surface? }
 *                          → the operator scanned a shelf label; refused unless
 *                            it is an urgency shelf of the suggested tier, else
 *                            writes `receiving_triage.staging_location_id`.
 *
 * No tiered shelf in the org → the suggestion is `no_shelves` ("No urgency
 * shelves configured").
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { commitIsPhoneOrigin } from '@/lib/auth/phone-origin.server';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { confirmPlacement, suggestPlacement } from '@/lib/receiving/arrival-shelves';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const receivingId = Number(segments[segments.indexOf('receiving') + 1]);
    if (!Number.isSafeInteger(receivingId) || receivingId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid receiving id' }, { status: 400 });
    }

    const raw: unknown = await request.json().catch(() => null);
    const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const action = body.action;

    if (action === 'suggest') {
      const result = await suggestPlacement(ctx.organizationId, receivingId);
      if (result.kind === 'not_found') {
        return NextResponse.json({ success: false, error: 'Carton not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        tier: result.tier,
        suggestion: result.suggestion,
        currentShelf: result.currentShelf,
        tierStamped: result.tierStamped,
      });
    }

    if (action !== 'confirm') {
      return NextResponse.json({ success: false, error: "action must be 'suggest' or 'confirm'" }, { status: 400 });
    }

    const scanned = typeof body.scanned === 'string' ? body.scanned.trim() : '';
    if (!scanned) {
      return NextResponse.json({ success: false, error: 'Scan the shelf label' }, { status: 400 });
    }
    const mobileScanEventId = Number.isSafeInteger(Number(body.mobileScanEventId)) && Number(body.mobileScanEventId) > 0
      ? Number(body.mobileScanEventId)
      : null;
    const phoneOrigin = await commitIsPhoneOrigin({
      session: ctx.session,
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      mobileScanEventId,
    });

    const result = await confirmPlacement(ctx.organizationId, {
      receivingId,
      scanned,
      staffId: ctx.staffId,
      phoneOrigin,
      clientEventId: typeof body.clientEventId === 'string' ? body.clientEventId : null,
      mobileScanEventId,
      surface: typeof body.surface === 'string' ? body.surface : null,
    });
    if (result.kind === 'not_found') {
      return NextResponse.json({ success: false, error: 'Carton not found' }, { status: 404 });
    }
    if (result.kind === 'refused') {
      return NextResponse.json(
        {
          success: false,
          reason: result.verdict.reason,
          error: result.verdict.message,
          suggestion: result.suggestion,
        },
        { status: 409 },
      );
    }

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingId),
          source: 'receiving.placement',
        });
      } catch (err) {
        console.warn('receiving/placement: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({ success: true, shelf: result.shelf, tier: result.tier, eventId: result.eventId });
  },
  { permission: 'receiving.mark_received' },
);
