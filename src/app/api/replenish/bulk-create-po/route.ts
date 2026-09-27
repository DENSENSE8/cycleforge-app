import { NextRequest, NextResponse } from 'next/server';
import { createDraftPurchaseOrders } from '@/lib/replenishment';
import { withAuth } from '@/lib/auth/withAuth';

// Creates internal purchase orders (inbound_order, on Incoming) from staged
// replenishment requests; `export_to_zoho: true` also posts a Zoho copy. Approval-level
// action — wired to replenish.approve_po which is in STEP_UP_PERMISSIONS so
// the wrapper also requires a fresh step-up grant.
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const ids = body.replenishment_request_ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: 'replenishment_request_ids must be a non-empty array' },
      { status: 400 }
    );
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 requests per batch' },
      { status: 400 }
    );
  }

  // Thread the caller's active tenant so the shared module filters out any cross-tenant replenishment_request_ids (org-scoped SELECT/UPDATE)…
  const created = await createDraftPurchaseOrders(ids, ctx.organizationId, undefined, {
    exportToZoho: body.export_to_zoho === true,
    staffId: ctx.staffId,
  });

  return NextResponse.json({
    success: true,
    purchase_orders: created,
    count: created.length,
  });
}, { permission: 'replenish.approve_po' });
