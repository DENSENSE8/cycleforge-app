/**
 * /api/receiving/putaway-targets — which rack or shelf each receipt type
 * (PO / RETURN / TRADE_IN) goes to. Contract:
 * src/lib/receiving/putaway-targets-contract.ts.
 *
 * GET  → `{ success: true, targets }`.
 * POST `{ action: 'link', kind, scanned, clientEventId }` |
 *      `{ action: 'unlink', kind, clientEventId }` → the full map after the write.
 * Failures: `{ success: false, error }` with 400 (bad body) / 409 (column not
 * migrated, or a concurrent link took the type) / 422 (unknown or inactive location).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  linkPutawayTarget,
  readPutawayTargets,
  unlinkPutawayTarget,
} from '@/lib/receiving/putaway-targets';
import {
  PutawayTargetActionBody,
  type PutawayTargets,
  type PutawayTargetsResponse,
} from '@/lib/receiving/putaway-targets-contract';
import pool from '@/lib/db';

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function ok(targets: PutawayTargets) {
  return NextResponse.json({ success: true, targets } satisfies PutawayTargetsResponse);
}

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    return ok(await readPutawayTargets(ctx.organizationId));
  } catch (error) {
    console.error('Error in GET /api/receiving/putaway-targets:', error);
    return fail('Failed to read putaway targets', 500);
  }
}, { permission: 'receiving.view' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = PutawayTargetActionBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid body', 400);
    }
    const body = parsed.data;

    if (body.action === 'link') {
      const result = await linkPutawayTarget(ctx.organizationId, {
        kind: body.kind,
        scanned: body.scanned,
        staffId: ctx.staffId,
        clientEventId: body.clientEventId,
      });
      if (result.kind === 'not_ready') return fail(result.error, 409);
      if (result.kind === 'unknown_location' || result.kind === 'inactive_location') {
        return fail(result.error, 422);
      }
      const target = result.targets[body.kind];
      if (result.changed && target) {
        await recordAudit(pool, ctx, req, {
          source: 'putaway-targets-api',
          action: AUDIT_ACTION.RACK_PUTAWAY_KIND_LINK,
          entityType: AUDIT_ENTITY.RACK,
          entityId: target.locationId,
          locationCode: target.code,
          method: 'scan',
          before: { kind: body.kind, location: result.previous, displacedKind: result.displacedKind },
          after: { kind: body.kind, location: target },
        });
      }
      return ok(result.targets);
    }

    const result = await unlinkPutawayTarget(ctx.organizationId, {
      kind: body.kind,
      staffId: ctx.staffId,
      clientEventId: body.clientEventId,
    });
    if (result.kind === 'not_ready') return fail(result.error, 409);
    if (result.previous) {
      await recordAudit(pool, ctx, req, {
        source: 'putaway-targets-api',
        action: AUDIT_ACTION.RACK_PUTAWAY_KIND_UNLINK,
        entityType: AUDIT_ENTITY.RACK,
        entityId: result.previous.locationId,
        locationCode: result.previous.code,
        before: { kind: body.kind, location: result.previous },
        after: { kind: body.kind, location: null },
      });
    }
    return ok(result.targets);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail('Another location just took this type — refresh and try again', 409);
    }
    console.error('Error in POST /api/receiving/putaway-targets:', error);
    return fail('Failed to update putaway target', 500);
  }
}, { permission: 'sku_stock.manage' });
