import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getCarrier } from '@/lib/tracking-format';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordReceivingScan } from '@/lib/receiving/record-scan';
import { recordUnboxScanOpened } from '@/lib/receiving/unbox-scan-opened';
import { classifyScanKind } from '@/lib/receiving/unbox-scan-kind';
import { NO_SESSION } from '@/lib/sessions/attribution';
import { recordUnboxLookupScan } from '@/lib/receiving/unbox-lookup-scan';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

/**
 * POST /api/receiving/touch-scan
 * Re-attribute a tracking scan to the signed-in operator without running lookup-po.
 * Used when the client short-circuits to an already-local carton (triage/unbox
 * re-scan) so receiving_scans.scanned_by stays accurate.
 */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();
    const receivingId = Number(body?.receiving_id ?? body?.receivingId);
    const trackingNumber = String(body?.tracking_number ?? body?.trackingNumber ?? '').trim();
    if (!Number.isFinite(receivingId) || receivingId <= 0 || !trackingNumber) {
      return NextResponse.json(
        { success: false, error: 'receiving_id and tracking_number are required' },
        { status: 400 },
      );
    }

    // Org-scope the ownership lookup: a cross-tenant receivingId now resolves to
    // no row → 404 (hides existence), which also gates the recordReceivingScan
    // write below so a caller can't re-attribute a scan onto another org's carton.
    // Carton identity + the unbox completion milestone in one round trip —
    // `ru.unboxed_at` is what separates a WORK scan from a LOOKUP of finished
    // work (see unbox-scan-kind.ts). LEFT JOIN: a carton with no street row yet
    // has never been unboxed, so it reads as work.
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
        // NO SESSION YET. Touch-scan is the client short-circuit rung of the
        // Unbox bench; when that surface opens a work session it arrives here
        // and replaces all three `NO_SESSION`s in this file.
        session: NO_SESSION,
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
      { intakeSurface, scanKind, session: NO_SESSION },
    );

    if (intakeSurface === 'unbox') {
      const { firstOpen } = await recordUnboxScanOpened(
        ctx.organizationId,
        receivingId,
        ctx.staffId,
        scanId,
        NO_SESSION,
        trackingNumber,
      );
      // First open only: the carton just left triage membership, so other
      // terminals' Arrival rails must purge it. lookup-po publishes this on its
      // own branches; touch-scan (the client short-circuit rung) was the gap —
      // an idle second Arrival tab showed the carton as phantom dock inventory
      // indefinitely. Re-scans stay publish-free (no org-wide refetch storm).
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
  } catch (error) {
    console.error('touch-scan error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'touch-scan failed' },
      { status: 500 },
    );
  }
}, { permission: 'receiving.scan_po' });
