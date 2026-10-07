import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { QcPrintPassBody } from '@/lib/schemas/qc-print-pass';
import { enqueueQcPrintPass, ensureQcUnitUid, runQcPrintPass } from '@/lib/tech/qc-print-pass';

/**
 * POST /api/qc/units/[id]/print-pass — the ONE request a QC Pass (or reprint)
 * sends after the label already printed client-side. It only enqueues the
 * press (one statement when the label carried the unit's id) and answers 202;
 * the print record and the PASS verdict run in the background job.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'tech.qc_pass');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const serialUnitId = Number(rawId);
    if (!Number.isInteger(serialUnitId) || serialUnitId <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid serial_unit id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const body = parseBody(QcPrintPassBody, raw);
    if (body instanceof NextResponse) return body;

    const orgId = gate.ctx.organizationId;
    const actorStaffId = typeof gate.ctx.staffId === 'number' && gate.ctx.staffId > 0 ? gate.ctx.staffId : null;

    // A unit with no id yet (rare): mint it now so the label can print it.
    let unitUid = body.unit_uid;
    if (!unitUid) {
      const minted = await ensureQcUnitUid(orgId, {
        serialUnitId,
        productSku: body.product_sku,
        skuCatalogId: body.sku_catalog_id,
        actorStaffId,
      });
      if (!minted.ok) {
        return NextResponse.json({ ok: false, error: minted.error }, { status: minted.status });
      }
      unitUid = minted.unitUid;
    }

    const enqueued = await enqueueQcPrintPass(orgId, {
      serialUnitId,
      clientEventId: body.client_event_id,
      actorStaffId,
      pass: body.pass,
      unitUid,
      payload: {
        gtin: body.gtin,
        symbology: body.symbology,
        condition: body.condition,
        notes: body.notes,
        product_sku: body.product_sku,
        sku_catalog_id: body.sku_catalog_id,
        serial_number: body.serial_number,
      },
    });
    if (!enqueued) {
      return NextResponse.json({ ok: false, error: 'unit not found' }, { status: 404 });
    }

    // The job claims its row, so a replayed press re-running it is a no-op.
    after(async () => {
      try {
        await runQcPrintPass(orgId, enqueued.outboxId);
      } catch (err) {
        // The claim goes stale and the cron sweep retries it.
        console.error(`[POST /api/qc/units/[id]/print-pass] outbox ${enqueued.outboxId} run errored`, err);
      }
    });

    return NextResponse.json(
      { ok: true, outbox_id: enqueued.outboxId, unit_uid: enqueued.unitUid },
      { status: 202 },
    );
  } catch (err) {
    console.error('[POST /api/qc/units/[id]/print-pass] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'print-pass failed' },
      { status: 500 },
    );
  }
}
