/**
 * /api/my-day/watch — Today Watch rail (ticket + tracking).
 *
 * GET  → current staffer's watched tickets + inbound carton subscriptions
 * POST → start watching
 *         { kind: 'ticket', value: '8192' | '#8192' }
 *         { kind: 'tracking', value: '<carrier tracking>' }
 *
 * Thin route: validate → domain helpers → audit. Permissions are kind-scoped
 * (auth-only outer gate — ticket needs integrations.zendesk; tracking needs
 * home.subscriptions.manage + Home Inbox flag).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { isHomeInbox } from '@/lib/feature-flags';
import { listSupportFollowupsForStaff } from '@/lib/inbox/support-followups-queries';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { invalidateZendeskTicketCache } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';
import { NOTIFIABLE_EVENTS } from '@/lib/notifications/event-vocabulary';
import {
  listReceivingWatchesForStaff,
  stopTrackingPreArrivalWatch,
  toggleEntitySubscription,
  watchTrackingPreArrival,
} from '@/lib/notifications/subscriptions';
import { resolveShipmentForScan } from '@/lib/receiving/resolve-shipment-for-scan';
import { parseTicketScanValue } from '@/lib/support/ticket-scan';
import { syncZendeskTicketRegistryCaches } from '@/lib/support/tickets';
import { upsertTicketAssignment } from '@/lib/zendesk-assignments';
import { extractCanonicalTracking } from '@/lib/tracking-format';

export const dynamic = 'force-dynamic';

const Body = z.object({
  kind: z.enum(['ticket', 'tracking']),
  value: z.string().trim().min(1).max(128),
  clientEventId: z.string().uuid().optional(),
  /**
   * Tracking only. `muted` is the operator's "Stop" — one verb for both arms,
   * because "stop watching this number" is one act to them even though it can
   * touch an entity row, a pre-arrival rule row, or both.
   */
  desired: z.enum(['subscribed', 'muted']).optional(),
});

/**
 * The arrival a pre-arrival watch waits on — named from the vocabulary rather
 * than typed as a literal, so a rename of the event key cannot leave watches
 * silently listening for an event nobody emits.
 */
const RECEIVING_CARTON_ARRIVED_EVENT_KEY =
  NOTIFIABLE_EVENTS['receiving.carton.arrived'].key;

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const context = 'GET /api/my-day/watch';
  try {
    const tickets = ctx.permissions.has('integrations.zendesk')
      ? (await listSupportFollowupsForStaff(ctx.organizationId, ctx.staffId)).map((row) => ({
          ticketId: row.ticketId,
          subject: row.subject,
          updatedAtMs: row.updatedAtMs,
        }))
      : [];

    let tracking: Array<{
      receivingId: number | null;
      tracking: string | null;
      preArrival: boolean;
      updatedAtMs: number;
    }> = [];
    if (
      ctx.permissions.has('home.subscriptions.manage') &&
      (await isHomeInbox(ctx.organizationId))
    ) {
      tracking = await listReceivingWatchesForStaff({
        orgId: ctx.organizationId,
        staffId: ctx.staffId,
      });
    }

    return NextResponse.json({ ok: true, tickets, tracking });
  } catch (err) {
    return errorResponse(err, context);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/my-day/watch';
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { kind, value, clientEventId, desired = 'subscribed' } = parsed.data;

    if (kind === 'ticket') {
      if (!ctx.permissions.has('integrations.zendesk')) {
        throw new ApiError(403, 'Helpdesk permission required to watch a ticket');
      }
      const ticketId = parseTicketScanValue(value);
      if (ticketId == null) {
        throw ApiError.badRequest('Enter a ticket number (e.g. 8192 or #8192)');
      }

      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      let subject: string | null = null;
      if (helpdesk && (await helpdesk.isConfigured())) {
        const ticket = await helpdesk.getTicket(ticketId).catch(() => null);
        if (!ticket) throw ApiError.notFound('Ticket', ticketId);
        subject = ticket.subject?.trim() || null;
        await syncZendeskTicketRegistryCaches({
          orgId: ctx.organizationId,
          zendeskTicketId: ticketId,
          subject,
          status: ticket.status ? String(ticket.status) : null,
          staffId: ctx.staffId,
        });
      } else {
        await syncZendeskTicketRegistryCaches({
          orgId: ctx.organizationId,
          zendeskTicketId: ticketId,
          subject: null,
          status: null,
          staffId: ctx.staffId,
        });
      }

      await upsertTicketAssignment({
        organizationId: ctx.organizationId,
        ticketId,
        staffId: ctx.staffId,
        assignedBy: ctx.staffId,
      });
      await invalidateZendeskTicketCache(ctx.organizationId, ticketId);

      await recordAudit(pool, ctx, req, {
        source: 'my-day-watch',
        action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
        entityType: AUDIT_ENTITY.STAFF,
        entityId: String(ctx.staffId),
        extra: { kind: 'ticket', ticketId },
      });
      ctx.markAuditWritten();

      return NextResponse.json({
        ok: true,
        kind: 'ticket',
        ticketId,
        subject,
        taskId: `support-${ticketId}`,
      });
    }

    // ── tracking ──────────────────────────────────────────────────────────
    if (!ctx.permissions.has('home.subscriptions.manage')) {
      throw new ApiError(403, 'Subscription permission required to watch tracking');
    }
    // Flag off → 404, not 403: match /api/subscriptions/toggle.
    if (!(await isHomeInbox(ctx.organizationId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const canonical = extractCanonicalTracking(value) || value.trim();
    if (canonical.length < 6) {
      throw ApiError.badRequest('Enter a full tracking number');
    }

    const resolved = await resolveShipmentForScan(canonical, ctx.organizationId);

    if (desired === 'muted') {
      /*
       * STOP — both arms, one call. The operator's sentence is "stop watching
       * this number", and which arm holds it is our bookkeeping: a number
       * watched before arrival lives in a `rule` row, the same number watched
       * after arrival lives in an `entity` row, and a number watched before
       * AND after has both. Asking the caller to know which would make the
       * Stop button wrong exactly at the moment the carton lands.
       */
      const { stopped } = await stopTrackingPreArrivalWatch({
        orgId: ctx.organizationId,
        staffId: ctx.staffId,
        trackingNormalized: canonical,
      });
      let entityStopped = false;
      if (resolved.receivingId) {
        const muted = await toggleEntitySubscription({
          orgId: ctx.organizationId,
          staffId: ctx.staffId,
          entityType: 'receiving',
          entityId: resolved.receivingId,
          desired: 'muted',
          permissions: [...ctx.permissions],
          clientEventId: clientEventId ?? null,
        });
        entityStopped = muted.outcome === 'muted';
      }

      await recordAudit(pool, ctx, req, {
        source: 'my-day-watch',
        action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
        entityType: AUDIT_ENTITY.STAFF,
        entityId: String(ctx.staffId),
        extra: { kind: 'tracking', tracking: canonical, desired: 'muted' },
      });
      ctx.markAuditWritten();

      return NextResponse.json({
        ok: true,
        kind: 'tracking',
        tracking: canonical,
        stopped: stopped > 0 || entityStopped,
      });
    }
    if (!resolved.receivingId) {
      /*
       * PRE-ARRIVAL (2026-09-22). This used to be the refusal
       * `'This tracking has no inbound carton yet — receive it first, then
       * watch.'` (plus a 404 when the number was unknown entirely) — which
       * rejected precisely the case the operator asks for: *"if you are
       * looking forward to receiving a package … input a tracking number …
       * as soon as the tracking number is scanned on arrival"*.
       *
       * There is no carton to point an `entity` subscription at yet, so this
       * writes a `rule` row instead: a predicate over the arrival event,
       * narrowed to this tracking number. See `watchTrackingPreArrival`.
       */
      const { created } = await watchTrackingPreArrival({
        orgId: ctx.organizationId,
        staffId: ctx.staffId,
        trackingNormalized: canonical,
        eventKey: RECEIVING_CARTON_ARRIVED_EVENT_KEY,
      });

      await recordAudit(pool, ctx, req, {
        source: 'my-day-watch',
        action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
        entityType: AUDIT_ENTITY.STAFF,
        entityId: String(ctx.staffId),
        extra: { kind: 'tracking', tracking: canonical, preArrival: true },
      });
      ctx.markAuditWritten();

      return NextResponse.json({
        ok: true,
        kind: 'tracking',
        tracking: canonical,
        preArrival: true,
        alreadyWatching: !created,
      });
    }

    const result = await toggleEntitySubscription({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      entityType: 'receiving',
      entityId: resolved.receivingId,
      desired: 'subscribed',
      permissions: [...ctx.permissions],
      clientEventId: clientEventId ?? null,
    });
    if (result.outcome === 'forbidden') {
      throw new ApiError(403, 'You cannot watch this carton');
    }
    if (result.outcome === 'invalid_entity') {
      throw ApiError.badRequest('Unknown entity type');
    }

    await recordAudit(pool, ctx, req, {
      source: 'my-day-watch',
      action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: String(ctx.staffId),
      extra: {
        kind: 'tracking',
        tracking: canonical,
        receivingId: resolved.receivingId,
        shipmentId: resolved.shipmentId,
      },
    });
    ctx.markAuditWritten();

    return NextResponse.json({
      ok: true,
      kind: 'tracking',
      tracking: canonical,
      receivingId: resolved.receivingId,
      shipmentId: resolved.shipmentId,
      subscription: result.subscription,
    });
  } catch (err) {
    return errorResponse(err, context);
  }
});
