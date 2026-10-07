/**
 * What every `/api/records/*` write route shares: the per-direction permission
 * gate (a Records write may name outbound AND inbound lines, each owned by its
 * own permission — the same ones the per-entity routes use), the audit writer
 * on the write's transaction, and the realtime / cache side-effects the
 * existing order and receiving routes fire.
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import pool from '@/lib/db';
import { audit } from '@/lib/auth/audit';
import { shouldRequireStepUp } from '@/lib/auth/authorization-mode';
import { requiresStepUp, rolesIncludeAdmin, type PermissionString } from '@/lib/auth/permissions';
import { hasStepUp } from '@/lib/auth/stepup';
import type { AuthContext } from '@/lib/auth/withAuth';
import { recordAudit } from '@/lib/audit-logs';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged, publishReceivingLogChanged } from '@/lib/realtime/publish';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import type { RecordTarget } from '@/lib/records/sheet-actions-contract';
import type { RecordWriteActor, RecordWriteOutcome } from './types';

type DirectionPermissions = Readonly<Record<RecordTarget['direction'], PermissionString>>;

/**
 * Edits (tracking, order number, bottom-bar verbs) — PATCH /api/orders/[id]
 * & friends (`orders.create`) / PATCH /api/receiving-lines (`receiving.mark_received`).
 */
export const RECORD_EDIT_PERMISSIONS: DirectionPermissions = {
  outbound: 'orders.create',
  inbound: 'receiving.mark_received',
};

/** Delete — DELETE /api/orders/[id] (`orders.void`, step-up) / DELETE /api/receiving-lines. */
export const RECORD_DELETE_PERMISSIONS: DirectionPermissions = {
  outbound: 'orders.void',
  inbound: 'receiving.mark_received',
};

/**
 * Refuse (403) unless the caller holds the permission of every direction the
 * targets name — with the step-up those permissions carry, exactly as
 * `withAuth` decides it. Null = allowed.
 */
export async function gateRecordTargets(
  req: NextRequest,
  ctx: AuthContext,
  targets: readonly RecordTarget[],
  permissions: DirectionPermissions,
): Promise<NextResponse | null> {
  const needed = [...new Set(targets.map((t) => permissions[t.direction]))];
  const missing = needed.filter((p) => !ctx.permissions.has(p));
  if (missing.length > 0) {
    const permission = missing.join('|');
    await audit({
      staffId: ctx.staffId,
      event: 'permission.denied',
      result: 'denied',
      sid: ctx.session?.sid ?? null,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent'),
      detail: { permission, api: true, path: req.nextUrl.pathname },
    });
    return NextResponse.json({ error: 'FORBIDDEN', permission, role: ctx.role }, { status: 403 });
  }
  const isAdmin = rolesIncludeAdmin(ctx.user.roles);
  for (const scope of needed) {
    const stepUp = shouldRequireStepUp({
      mode: ctx.authorizationMode,
      isAdmin,
      explicit: false,
      permissionRequiresStepUp: requiresStepUp(scope),
    });
    if (stepUp && !(await hasStepUp(ctx.session.sid, scope))) {
      return NextResponse.json({ error: 'STEPUP_REQUIRED', scope, method_hint: 'pin' }, { status: 403 });
    }
  }
  return null;
}

/** The actor a Records domain write needs: org, staff, and audit rows on its own transaction. */
export function recordWriteActor(req: NextRequest, ctx: AuthContext): RecordWriteActor {
  return {
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    audit: async (tx, entry) => {
      await recordAudit(tx, ctx, req, { source: 'records-sheet', method: 'manual', ...entry });
    },
  };
}

/** Fire the cache busts and realtime events the per-entity routes fire for the rows this write changed. */
export async function publishRecordWrite(
  ctx: AuthContext,
  outcome: RecordWriteOutcome,
  opts: { source: string; receivingAction: 'update' | 'delete'; orderCacheTags?: string[]; recomputeEnrichment?: boolean },
): Promise<void> {
  const orgId = ctx.organizationId;
  const { changedOrderIds: orderIds, changedReceivingLineIds: lineIds } = outcome;
  if (orderIds.length > 0) {
    await invalidateAllOrdersApiCaches(opts.orderCacheTags ?? ['shipped', 'packing-logs'], orgId);
    await publishOrderChanged({ organizationId: orgId, orderIds, source: opts.source });
    if (opts.recomputeEnrichment) {
      // Tracking linkage / deletes flip the packed-scan order match; refresh the read model.
      after(() =>
        recomputeEnrichmentForOrders(pool, orderIds).catch((e) =>
          console.warn(`[${opts.source}] enrichment recompute failed`, e),
        ),
      );
    }
  }
  if (lineIds.length > 0) {
    await invalidateReceivingViews(orgId);
    await publishReceivingLogChanged({
      organizationId: orgId,
      action: opts.receivingAction,
      rowId: lineIds.length === 1 ? String(lineIds[0]) : `bulk:${lineIds.length}`,
      source: opts.source,
    });
  }
}
