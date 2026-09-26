import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm, recordRouteAudit } from '@/lib/auth/dynamic-route-guard';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery } from '@/lib/tenancy/db';
import { lookupAmazonReturnByTracking } from '@/lib/amazon/returns-lookup';
import { classificationToColumns } from '@/lib/receiving/intake-classification';

/** POST /api/receiving/[id]/amazon-return-lookup — operator-initiated Amazon Returns lookup for an UNFOUND carton (the UnfoundMatchStrip… */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'receiving.scan_po');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const { id: idRaw } = await params;
  const receivingId = Number(idRaw);
  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    return NextResponse.json({ success: false, error: 'Valid id is required' }, { status: 400 });
  }

  // Verify org ownership + derive the carton's reverse (carrier) tracking. The
  // tenant-scoped query can never read another org's carton.
  const cartonRes = await tenantQuery<{ tracking: string | null }>(
    orgId,
    `SELECT stn.tracking_number_raw AS tracking
       FROM receiving_carton r
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
      WHERE r.id = $1 AND r.organization_id = $2
      LIMIT 1`,
    [receivingId, orgId],
  );
  if (cartonRes.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'carton not found' }, { status: 404 });
  }
  const tracking = (cartonRes.rows[0].tracking || '').trim();
  if (!tracking) {
    return NextResponse.json(
      { success: false, error: 'This carton has no tracking number to match on.' },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await lookupAmazonReturnByTracking(orgId, tracking);
  } catch (err) {
    // Genuine transient/unknown SP-API failure (not an authorization gap).
    const message = err instanceof Error ? err.message : 'Amazon Returns lookup failed';
    console.error('[receiving/amazon-return-lookup] SP-API error', { receivingId, message });
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }

  // Not enrolled / no connected account — a config gap, surfaced as unsupported.
  if (result.unsupported) {
    return NextResponse.json({
      success: true,
      matched: false,
      unsupported: true,
      error: result.reason ?? 'Amazon Returns access is not enabled for this connection.',
    });
  }

  if (!result.matched || !result.match) {
    const response = NextResponse.json({ success: true, matched: false, unsupported: false });
    await recordRouteAudit(request, gate.ctx, response, AUDIT_OPTS(receivingId));
    return response;
  }

  const m = result.match;
  // Stamp the carton as an Amazon return (single mapping SoT). Best-effort — a
  // failed stamp still returns the facts the operator asked for.
  const cols = classificationToColumns('AMAZON_RETURN');
  await tenantQuery(
    orgId,
    `UPDATE receiving_carton
        SET source_platform = $2, is_return = $3, return_platform = $4, updated_at = NOW()
      WHERE id = $1 AND organization_id = $5`,
    [receivingId, cols.source_platform, cols.is_return, cols.return_platform, orgId],
  ).catch((err) => {
    console.warn('[receiving/amazon-return-lookup] classification stamp failed', {
      receivingId,
      message: err instanceof Error ? err.message : err,
    });
  });

  const skus = [m.merchantSku, m.channelSku].filter((s): s is string => Boolean(s));
  const response = NextResponse.json({
    success: true,
    matched: true,
    unsupported: false,
    return_id: m.returnId || null,
    rma_id: m.rmaId,
    customer_order_id: m.customerOrderId,
    carrier_name: m.carrierName,
    skus,
  });
  await recordRouteAudit(request, gate.ctx, response, AUDIT_OPTS(receivingId));
  return response;
}

/** Shared audit opts for the matched + no-match responses. */
function AUDIT_OPTS(receivingId: number) {
  return {
    source: 'receiving.amazon_return_lookup',
    action: AUDIT_ACTION.RECEIVING_AMAZON_RETURN_LOOKUP,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: () => receivingId,
    extra: ({ response }: { response: unknown }) => {
      const r = response as { matched?: boolean; return_id?: string | null } | null;
      return { matched: r?.matched ?? false, return_id: r?.return_id ?? null };
    },
  };
}
