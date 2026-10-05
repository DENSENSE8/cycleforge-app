/**
 * /api/receiving/[id]/arrival — the arrival pairing of one package
 * (wire shapes: `src/lib/receiving/arrival-contract.ts`).
 *
 *   GET   → { success, package }
 *   POST  { action: 'urgency', urgent: true|false|null, clientEventId }
 *         { action: 'place', scanned, clientEventId, surface? }
 *         → { success, package }
 *
 * Urgency writes `receiving_carton.priority_tier` (Urgent 0, Not urgent 2,
 * null clears). Place pairs the package to ANY active location with that
 * label; a shelf's own arrival tier never refuses. Failures are
 * `{ success: false, error }` with 400 / 404 / 422.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { commitIsPhoneOrigin } from '@/lib/auth/phone-origin.server';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { ArrivalActionBody, type ArrivalPackageResponse } from '@/lib/receiving/arrival-contract';
import { placeArrivalPackage, readArrivalPackage, setArrivalUrgency } from '@/lib/receiving/arrival-package';
import type { OrgId } from '@/lib/tenancy/constants';

type Params = { params: Promise<{ id: string }> };

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

async function packageResponse(orgId: OrgId, receivingId: number) {
  const pkg = await readArrivalPackage(orgId, receivingId);
  if (!pkg) return fail('Package not found', 404);
  return NextResponse.json({ success: true, package: pkg } satisfies ArrivalPackageResponse);
}

function changedAfter(orgId: OrgId, receivingId: number) {
  after(async () => {
    try {
      await invalidateReceivingViews(orgId);
      await publishReceivingLogChanged({
        organizationId: orgId,
        action: 'update',
        rowId: String(receivingId),
        source: 'receiving.arrival',
      });
    } catch (err) {
      console.warn('receiving/arrival: cache/realtime update failed', err);
    }
  });
}

async function receivingIdFrom(params: Params['params']): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const gate = await requireRoutePerm(req, 'receiving.view');
    if (gate.denied) return gate.denied;
    const receivingId = await receivingIdFrom(params);
    if (receivingId == null) return fail('Invalid package id', 400);
    return await packageResponse(gate.ctx.organizationId, receivingId);
  } catch (err) {
    console.error('GET /api/receiving/[id]/arrival failed', err);
    return fail('Could not load the package', 500);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const gate = await requireRoutePerm(req, 'receiving.mark_received');
    if (gate.denied) return gate.denied;
    const ctx = gate.ctx;
    const orgId = ctx.organizationId;
    const receivingId = await receivingIdFrom(params);
    if (receivingId == null) return fail('Invalid package id', 400);

    const parsed = ArrivalActionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail('Send urgency or a scanned location label', 400);
    const body = parsed.data;

    if (body.action === 'urgency') {
      const result = await setArrivalUrgency(orgId, { receivingId, urgent: body.urgent });
      if (result.kind === 'not_found') return fail('Package not found', 404);
      if (result.changed) {
        await recordAudit(pool, ctx, req, {
          source: 'receiving.arrival',
          action: AUDIT_ACTION.RECEIVING_HEADER_UPDATE,
          entityType: AUDIT_ENTITY.RECEIVING,
          entityId: receivingId,
          before: { priority_tier: result.before },
          after: { priority_tier: result.after },
          method: 'manual',
          extra: { clientEventId: body.clientEventId, arrivalAction: 'urgency' },
        });
        changedAfter(orgId, receivingId);
      }
      return await packageResponse(orgId, receivingId);
    }

    const phoneOrigin = await commitIsPhoneOrigin({
      session: ctx.session,
      organizationId: orgId,
      staffId: ctx.staffId,
      mobileScanEventId: null,
    });
    const result = await placeArrivalPackage(orgId, {
      receivingId,
      scanned: body.scanned,
      staffId: ctx.staffId,
      phoneOrigin,
      clientEventId: body.clientEventId,
      surface: body.surface ?? null,
    });
    if (result.kind === 'not_found') return fail('Package not found', 404);
    if (result.kind === 'unknown_location') return fail(result.error, 404);
    if (result.kind === 'inactive_location') return fail(result.error, 422);
    if (result.changed) {
      await recordAudit(pool, ctx, req, {
        source: 'receiving.arrival',
        action: AUDIT_ACTION.RECEIVING_HEADER_UPDATE,
        entityType: AUDIT_ENTITY.RECEIVING,
        entityId: receivingId,
        before: { staging_location_id: result.before?.id ?? null },
        after: { staging_location_id: result.location.id },
        locationCode: result.location.code,
        scanRef: body.scanned,
        method: 'scan',
        extra: { clientEventId: body.clientEventId, arrivalAction: 'place', opsEventId: result.eventId },
      });
      changedAfter(orgId, receivingId);
    }
    return await packageResponse(orgId, receivingId);
  } catch (err) {
    console.error('POST /api/receiving/[id]/arrival failed', err);
    return fail('Could not save the package', 500);
  }
}
