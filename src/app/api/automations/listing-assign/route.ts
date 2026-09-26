import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { ListingAssignBody } from '@/lib/schemas/automations';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  listingAssignFromOrders,
  previewListingAssign,
} from '@/lib/automations/listing-assign-from-orders';
import pool from '@/lib/db';

const ROUTE_LISTING_ASSIGN_POST = 'automations.listing-assign.post';

/**
 * GET /api/automations/listing-assign?orderIds=1,2,3
 * Preview distinct (item #, SKU) pairs covered by the selection, each with the
 * rule that keys it (pair rule, else item-#-only) and its primary/backup staff.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const raw = req.nextUrl.searchParams.get('orderIds') || '';
  const orderIds = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 200);
  if (orderIds.length === 0) {
    return NextResponse.json(
      { success: false, error: 'orderIds query required' },
      { status: 400 },
    );
  }
  const preview = await previewListingAssign(ctx.organizationId, orderIds);
  return NextResponse.json({ success: true, ...preview });
}, { permission: 'work_orders.claim' });

/** POST /api/automations/listing-assign save_and_assign — upsert one rule per (item #, SKU) pair (primary + optional backup per role) +… */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(ListingAssignBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
  if (idemKey) {
    const hit = await getApiIdempotencyResponse(
      pool,
      ctx.organizationId,
      idemKey,
      ROUTE_LISTING_ASSIGN_POST,
    );
    if (hit) return NextResponse.json(hit.response_body, { status: hit.status_code });
  }

  const result = await listingAssignFromOrders({
    organizationId: ctx.organizationId,
    orderIds: parsed.orderIds,
    mode: parsed.mode,
    techId: parsed.techId,
    packerId: parsed.packerId,
    backupTechId: parsed.backupTechId,
    backupPackerId: parsed.backupPackerId,
    actorStaffId: ctx.staffId ?? null,
  });

  await recordAudit(pool, ctx, req, {
    source: 'automations-api',
    action:
      parsed.mode === 'save_and_assign'
        ? AUDIT_ACTION.AUTOMATION_RULE_CREATE
        : AUDIT_ACTION.AUTOMATION_RULE_UPDATE,
    entityType: AUDIT_ENTITY.AUTOMATION_RULE,
    entityId: `listing-assign:${parsed.orderIds[0]}`,
    after: {
      mode: result.mode,
      rulesUpserted: result.rulesUpserted,
      listings: result.listings,
      assigned: result.orderResults.filter((r) => r.status === 'assigned' || r.status === 'rule_applied')
        .length,
    },
  });

  const responseBody = { success: true, ...result };
  if (idemKey) {
    await saveApiIdempotencyResponse(pool, {
      orgId: ctx.organizationId,
      idempotencyKey: idemKey,
      route: ROUTE_LISTING_ASSIGN_POST,
      staffId: ctx.staffId,
      statusCode: 200,
      responseBody,
    });
  }

  return NextResponse.json(responseBody);
}, { permission: 'work_orders.claim' });
