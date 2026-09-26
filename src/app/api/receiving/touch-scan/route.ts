import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getCarrier } from '@/lib/tracking-format';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordReceivingScan } from '@/lib/receiving/record-scan';
import { recordUnboxScanOpened } from '@/lib/receiving/unbox-scan-opened';
import { classifyScanKind } from '@/lib/receiving/unbox-scan-kind';
import { recordUnboxLookupScan } from '@/lib/receiving/unbox-lookup-scan';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

/** POST /api/receiving/touch-scan Re-attribute a tracking scan to the signed-in operator without running lookup-po. */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const receivingId = Number(body?.receiving_id ?? body?.receivingId);
  const trackingNumber = String(body?.tracking_number ?? body?.trackingNumber ?? '').trim();
  if (!Number.isFinite(receivingId) || receivingId <= 0 || !trackingNumber) {
    return NextResponse.json(
      { success: false, error: 'receiving_id and tracking_number are required' },
      { status: 400 },
    );
  }

  // Org-scope the ownership lookup:
  const meta = await tenantQuery<{
    source: string | null;
    carrier: string | null;
    unboxed_at: string | null;
    unboxed_by_name: string | null;
    zoho_purchaseorder_number: string | null;
  }>(
    ctx.organizationId,
    `SELECT rc.source, rc.carrier, rc.zoho_purchaseorder_number,
              ru.unboxed_at, staff_unbox.name AS unboxed_by_name
         FROM receiving_carton rc
         LEFT JOIN receiving_unbox ru
           ON ru.receiving_id = rc.id AND ru.organization_id = rc.organization_id
         LEFT JOIN staff staff_unbox ON staff_unbox.id = ru.unboxed_by
        WHERE rc.id = $1 AND rc.organization_id = $2
        LIMIT 1`,
    [receivingId, ctx.organizationId],
  );
  const row = meta.rows[0];
  if (!row) {
    return NextResponse.json({ success: false, error: 'Receiving carton not found' }, { status: 404 });
  }

  const providedCarrier = String(body?.carrier ?? '').trim();
  const carrier =
    providedCarrier && providedCarrier !== 'Unknown'
      ? providedCarrier
      : row.carrier && row.carrier !== 'Unknown'
        ? row.carrier
        : getCarrier(trackingNumber);
  const source = row.source === 'zoho_po' ? 'zoho_po' : 'unmatched';
  const intakeSurface =
    String(body?.intakeSurface ?? '').trim().toLowerCase() === 'unbox' ? 'unbox' : 'triage';

  // Already unboxed → this scan is an inspection, not work. It must not claim
  // `scanned_by` from whoever actually unboxed the carton, must not stamp the
  // unbox-open milestone, and must not fire UNBOX_SCAN_OPENED.
  const scanKind = classifyScanKind(intakeSurface, { unboxedAt: row.unboxed_at });

  if (scanKind === 'lookup') {
    await recordUnboxLookupScan({
      organizationId: ctx.organizationId,
      receivingId,
      actorStaffId: ctx.staffId,
      trackingNumber,
    });
    return NextResponse.json({
      success: true,
      scan_kind: 'lookup',
      receiving_id: receivingId,
      unboxed_at: row.unboxed_at,
      // The receipt names the operator who did the work and offers a search
      // jump on the PO — both resolved here so the pane never has to wait for
      // the workspace row to hydrate.
      unboxed_by_name: row.unboxed_by_name,
      po_number: row.zoho_purchaseorder_number,
    });
  }

  const scanId = await recordReceivingScan(
    receivingId,
    trackingNumber,
    carrier,
    ctx.staffId,
    source,
    { intakeSurface, scanKind },
  );

  if (intakeSurface === 'unbox') {
    const { firstOpen } = await recordUnboxScanOpened(
      ctx.organizationId,
      receivingId,
      ctx.staffId,
      scanId,
      trackingNumber,
    );
    // First open only:
    if (firstOpen) {
      after(async () => {
        try {
          await publishReceivingLogChanged({
            organizationId: ctx.organizationId,
            action: 'update',
            rowId: String(receivingId),
            source: 'receiving.touch-scan.unbox-opened',
          });
        } catch (err) {
          console.warn('[touch-scan] realtime publish failed:', err);
        }
      });
    }
  }

  return NextResponse.json({ success: true, scan_id: scanId, receiving_id: receivingId });
}, { permission: 'receiving.scan_po' });
