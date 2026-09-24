import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  ReleaseGatesNotMetError,
  cageOrder,
  getOrderReleaseRecord,
  releaseOrder,
  setDocsNotRequired,
  setOrderParcel,
} from '@/lib/orders/caged-orders';
import { invalidateOrderViews } from '@/lib/orders/invalidation';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * The cage gate for ONE order (To-ship intake).
 *
 * Named `cage-release` and not `release` because
 * `POST /api/orders/[id]/release` already exists and means something else
 * entirely — it unwinds `order_unit_allocations` back to STOCKED. Two verbs
 * called "release" on the same noun is how an operator cancels an allocation
 * while trying to open a cage.
 *
 * | Method | Does |
 * |---|---|
 * | GET | live G1/G2/G3 evaluation for this order |
 * | POST `{action:'release'}` | re-evaluates and releases, or 409s with the failures |
 * | POST `{action:'cage'}` | puts a not-yet-released order back in the cage |
 * | POST `{action:'docs-not-required', value}` | sets/clears the G2 exemption |
 * | POST `{action:'set-parcel', weightOz?, lengthIn?, widthIn?, heightIn?}` | persists the parcel on the order |
 *
 * `withAuth` ignores Next's route-`params`, so this uses the plain handler form
 * with `requireRoutePerm` inside — the house pattern for `[id]` routes.
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const orderId = parseId(rawId);
    if (orderId === null) {
      return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
    }

    const record = await getOrderReleaseRecord(gate.ctx.organizationId as OrgId, orderId);
    if (!record) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, order: record });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]/cage-release:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to evaluate release gates' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const orderId = parseId(rawId);
    if (orderId === null) {
      return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      value?: unknown;
      weightOz?: unknown;
      lengthIn?: unknown;
      widthIn?: unknown;
      heightIn?: unknown;
    };
    const action = String(body?.action || 'release').trim().toLowerCase();
    const orgId = gate.ctx.organizationId as OrgId;
    const staffId =
      typeof gate.ctx.staffId === 'number' && gate.ctx.staffId > 0 ? gate.ctx.staffId : null;

    if (action === 'docs-not-required') {
      const value = body?.value !== false;
      const updated = await setDocsNotRequired(orgId, orderId, value);
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, order: updated });
    }

    if (action === 'set-parcel') {
      // Absent / non-numeric / non-positive → NULL (cleared). The domain
      // writer re-checks, so a hostile body can at worst clear its own parcel.
      const num = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const updated = await setOrderParcel(orgId, orderId, {
        weightOz: num(body?.weightOz),
        lengthIn: num(body?.lengthIn),
        widthIn: num(body?.widthIn),
        heightIn: num(body?.heightIn),
      }, { staffId });
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, order: updated });
    }

    if (action === 'cage') {
      const before = await getOrderReleaseRecord(orgId, orderId);
      if (!before) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
      }
      // A released order is working stock — re-caging it would pull a live row
      // off the floor mid-shift, so the domain refuses and this reports it.
      if (before.releaseState === 'released') {
        return NextResponse.json(
          { success: false, error: 'ALREADY_RELEASED', order: before },
          { status: 409 },
        );
      }
      await cageOrder(orgId, orderId);
      const after = await getOrderReleaseRecord(orgId, orderId);

      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-cage-api',
        action: AUDIT_ACTION.ORDER_CAGE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        before: { releaseState: before.releaseState },
        after: { releaseState: after?.releaseState ?? 'caged' },
      });

      return NextResponse.json({ success: true, order: after });
    }

    if (action !== 'release') {
      return NextResponse.json(
        { success: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
    }

    const before = await getOrderReleaseRecord(orgId, orderId);
    if (!before) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    let released;
    try {
      released = await releaseOrder(orgId, orderId, staffId);
    } catch (error) {
      // The gates are enforced in the transaction, not by the disabled button.
      // A stale green preview lands here and gets the LIVE failures back so the
      // form can repaint the real reason instead of "something went wrong".
      if (error instanceof ReleaseGatesNotMetError) {
        return NextResponse.json(
          { success: false, error: 'GATES_NOT_MET', gates: error.gates },
          { status: 409 },
        );
      }
      throw error;
    }

    if (!released) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Idempotent re-post: already released, nothing changed, no second audit row.
    if (before.releaseState === 'released') {
      return NextResponse.json({ success: true, order: released, idempotent: true });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-cage-api',
      action: AUDIT_ACTION.ORDER_RELEASE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      before: { releaseState: before.releaseState },
      after: {
        releaseState: released.releaseState,
        releasedAt: released.releasedAt,
        releasedBy: released.releasedBy,
        gates: released.gates.gates.map((g) => ({ id: g.id, passed: g.passed })),
      },
    });

    // A released order joins the live queue — the desk's caches must stop
    // showing it as caged.
    await invalidateOrderViews({
      organizationId: orgId,
      orderIds: [orderId],
      source: 'orders.cage-release',
    }).catch((error) => {
      console.error('cage-release: order view invalidation failed', error);
    });

    return NextResponse.json({ success: true, order: released });
  } catch (error) {
    console.error('Error in POST /api/orders/[id]/cage-release:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update release state' },
      { status: 500 },
    );
  }
}
