/**
 * GET /api/interop/asn/:shipmentId — one shipment as an EDI 856 hierarchy.
 *
 * READ-ONLY. Emits the HL hierarchy as JSON, not an X12 envelope — see
 * `@/lib/interop/asn-projection` for why this repo must not grow a segment
 * serializer.
 *
 * `shipmentId` is `shipping_tracking_numbers.id`. Scope is enforced by
 * reachability through this org's cartons (`fetchAsnShipment`), so another
 * tenant's shipment id 404s exactly like a nonexistent one.
 *
 * The param is read from the pathname rather than a route context because
 * `withAuth` does not forward the second Next argument — the same idiom as
 * `/api/orders/lookup/[orderId]`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { projectAsn } from '@/lib/interop/asn-projection';
import {
  fetchAsnCartons,
  fetchAsnLines,
  fetchAsnShipment,
} from '@/lib/interop/asn-queries';
import { resolveOrgGs1Identity } from '@/lib/interop/org-gs1';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    if (!orgId) {
      return NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 });
    }

    const segments = request.nextUrl.pathname.split('/').filter(Boolean);
    const raw = segments[segments.length - 1];
    const shipmentId = Number(raw);
    if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
      return NextResponse.json({ error: 'INVALID_SHIPMENT_ID' }, { status: 400 });
    }

    const identity = await resolveOrgGs1Identity(orgId);

    const doc = await projectAsn(
      { orgId, shipmentId, identity },
      {
        fetchShipment: fetchAsnShipment,
        fetchCartons: fetchAsnCartons,
        fetchLines: fetchAsnLines,
      },
    );

    // A missing shipment is a 404, never an empty document — an empty
    // hierarchy asserts "this shipment contains nothing", which is a
    // different and false claim.
    if (!doc) {
      return NextResponse.json({ error: 'SHIPMENT_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      documentType: 'EDI_856_ASN',
      transactionSet: '856',
      shape: doc.shape,
      hlCount: doc.hlCount,
      exceedsSingleDocument: doc.exceedsSingleDocument,
      hierarchy: doc.hierarchy,
      cycleforge_meta: doc.meta,
    });
  },
  { permission: 'interop.read' },
);
