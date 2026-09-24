import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

/**
 * Local Pickup display feed — the flattened product rows for the `/pickup`
 * receiving mode, grouped by their LCPU order (the Unbox-family "row = product,
 * group = PO" shape).
 *
 * Local Pickup data lives in `local_pickup_orders` + `local_pickup_order_items`
 * (the only LCPU dataset that carries products — the `zoho_po_mirror` LCPU POs
 * are header-only), linked to Zoho by `zoho_po_id`. The sibling
 * `GET /api/local-pickup-orders` returns order HEADERS with item *counts*; this
 * feed returns the individual product lines the workbench table + sidebar rail
 * render.
 *
 * `?status=` narrows to one order status (default: every status except VOIDED,
 * so the current DRAFT pickup orders appear). `?limit=` caps rows (default 500).
 *
 * `?q=` is the workbench's find text, ANSWERED HERE. The `/pickup` field used
 * to filter the loaded page in the browser, so a product whose PO sat past row
 * 500 could not be found at all, and one whose only match was a reference
 * number the mounted tracks do not paint was dropped by the client pass even
 * when this feed had returned it. The columns below are exactly the facts a
 * pickup row paints (title, SKU, PO#, reference, customer), so a hit is always
 * a row the operator can see is a hit.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || '').trim().toUpperCase();
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 500), 1), 1000);

    const params: unknown[] = [ctx.organizationId];
    const clauses = ['i.organization_id = $1', "o.status <> 'VOIDED'"];
    if (status) {
      params.push(status);
      clauses.push(`o.status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const qIdx = params.length;
      clauses.push(
        `(i.product_title ILIKE $${qIdx}
           OR i.sku ILIKE $${qIdx}
           OR o.zoho_purchaseorder_number ILIKE $${qIdx}
           OR o.zoho_reference_number ILIKE $${qIdx}
           OR o.customer_name ILIKE $${qIdx})`,
      );
    }
    // A SEARCH IS NOT A PAGE. `?limit=` is the display window the workbench
    // scrolls; honouring it under `q` would answer "no match" for a row sitting
    // one past the bound — the same lie one layer down that the client-side
    // filter told. A searching read opens to this endpoint's hard ceiling.
    params.push(q ? 1000 : limit);
    const limitIdx = params.length;

    const rows = await tenantQuery(
      ctx.organizationId,
      `SELECT
         i.id,
         i.order_id,
         i.sku,
         i.product_title,
         i.image_url,
         i.quantity,
         i.condition_grade,
         i.parts_status,
         i.missing_parts_note,
         i.condition_note,
         COALESCE(i.total_price, 0)::numeric(12,2)::text AS total_price,
         o.zoho_purchaseorder_number AS po_number,
         o.zoho_reference_number     AS reference_number,
         o.customer_name,
         o.status                    AS order_status,
         o.receiving_id,
         o.pickup_date::text         AS pickup_date,
         o.zoho_po_id,
         m.status                    AS zoho_status,
         m.total::text               AS zoho_total,
         m.po_date::text             AS zoho_po_date,
         m.vendor_name               AS zoho_vendor_name
       FROM local_pickup_order_items i
       JOIN local_pickup_orders o
         ON o.id = i.order_id AND o.organization_id = i.organization_id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id::text = o.zoho_po_id::text
        AND m.organization_id = o.organization_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY o.pickup_date DESC NULLS LAST, o.created_at DESC, i.id ASC
       LIMIT $${limitIdx}`,
      params,
    );

    return NextResponse.json({ success: true, lines: rows.rows });
  } catch (error: unknown) {
    console.error('[local-pickup-orders/lines][GET]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch pickup lines';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'walk_in.view' });
