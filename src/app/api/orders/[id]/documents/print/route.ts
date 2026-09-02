import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { dispatchPrintBundle } from '@/lib/documents/print-bundle';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/**
 * POST /api/orders/[id]/documents/print
 *
 * JIT pack documents Phase 1–2 — Print-on-Pack-Confirm / reprint.
 * Resolves shipping_label + packing_slip + assigned product_manuals,
 * dispatches via NAS media agent (`vendor=agent`) or PrintNode pdf_base64 when
 * an outbound printer profile exists; otherwise returns browserFallbackDocs
 * for the Station iframe path.
 * Never re-buys postage.
 *
 * Body: { packerLogId?: number, shipmentId?: number, reprint?: boolean }
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'packing.complete_order');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = parseId(rawId);
  if (orderId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const packerLogId =
    Number.isFinite(Number(body?.packerLogId)) && Number(body.packerLogId) > 0
      ? Math.floor(Number(body.packerLogId))
      : null;
  const shipmentId =
    Number.isFinite(Number(body?.shipmentId)) && Number(body.shipmentId) > 0
      ? Math.floor(Number(body.shipmentId))
      : null;
  const reprint = Boolean(body?.reprint);

  const orgId = gate.ctx.organizationId as OrgId;
  const staffId = gate.ctx.staffId ?? null;

  try {
    const printBundle = await dispatchPrintBundle(orgId, {
      orderId,
      packerLogId,
      shipmentId,
      actorStaffId: staffId,
      reprint,
    });

    if (printBundle.status !== 'missing') {
      await recordAudit(pool, gate.ctx, req, {
        source: 'api.orders.documents.print',
        action: reprint
          ? AUDIT_ACTION.ORDER_DOCUMENT_BUNDLE_REPRINT
          : AUDIT_ACTION.ORDER_DOCUMENT_BUNDLE_PRINT,
        entityType: 'ORDER',
        entityId: String(orderId),
        extra: {
          status: printBundle.status,
          missing_types: printBundle.missingTypes,
          manuals_resolved: printBundle.manualsResolved,
          job_count: printBundle.jobs.length,
          idempotent: printBundle.idempotent,
          packer_log_id: packerLogId,
          reprint,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, printBundle });
  } catch (err) {
    console.error('[POST /api/orders/[id]/documents/print]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Print bundle failed' },
      { status: 500 },
    );
  }
}
