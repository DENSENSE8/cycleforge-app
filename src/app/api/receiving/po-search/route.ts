import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * Read-only PO typeahead for the Package Pairing "Link a PO" tab.
 *
 * LOCAL mirror first (`zoho_po_mirror`) — no Zoho round-trip, no side effects.
 * This is deliberately pure: it never creates/adopts a carton (that's
 * lookup-po's job). The "Link a PO" tab calls this to pick a PO, then POSTs
 * /api/receiving/relink to write the linkage. Org-scoped (the mirror carries
 * organization_id since the 2026-06-14 org phase).
 *
 * Matches PO# (normalized), reference# (normalized), raw PO#, or vendor name.
 *   GET /api/receiving/po-search?q=6000  →  { success, candidates: PoCandidate[] }
 */
interface PoCandidateRow {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  reference_number: string | null;
  vendor_name: string | null;
  status: string | null;
}

interface OrderCandidateRow {
  order_id: string;
  product_title: string | null;
  sku: string | null;
  account_source: string | null;
  status: string | null;
  order_date: string | null;
  item_count: number;
  image_url: string | null;
}

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  // Empty/short query → return the most recently synced POs (the locally stored
  // incoming PO mirror) so the tab lists them by default; ≥2 chars filters.
  const hasQuery = q.length >= 2;
  const norm = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const like = `%${q}%`;

  const { rows } = await tenantQuery<PoCandidateRow>(
    ctx.organizationId,
    `SELECT zoho_purchaseorder_id,
            zoho_purchaseorder_number,
            reference_number,
            vendor_name,
            status
       FROM zoho_po_mirror
      WHERE organization_id = $1
        AND ($4 = false OR (
          ($2 <> '' AND zoho_purchaseorder_number_norm LIKE '%' || $2 || '%')
          OR ($2 <> '' AND NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') LIKE '%' || $2 || '%')
          OR zoho_purchaseorder_number ILIKE $3
          OR vendor_name ILIKE $3
        ))
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 20`,
    [ctx.organizationId, norm, like, hasQuery],
  );

  // Previous ORDERS — the second identifier namespace an operator pairs from.
  // A box rarely carries a Zoho PO#: it carries a marketplace order number, and
  // before this the pairing surface could not see `orders` at all, so a real
  // order that was already in the system read as "no matches". Matched on the
  // order id (exact, prefix and normalized contains) plus the product title,
  // newest first.
  // The thumb runs the SKU IDENTITY LAW ladder (src/lib/sku/sku-identity-law.ts):
  // the Zoho item photo when an active `items` row exists for that SKU (proxied
  // when Zoho stored a document id rather than a URL), catalog image ONLY when
  // it does not — a bare `sku_catalog` image beside a Zoho-twinned SKU is how
  // the wrong product ends up on a row. Both lookups are org-scoped.
  const orderRows = hasQuery
    ? (
        await tenantQuery<OrderCandidateRow>(
          ctx.organizationId,
          `WITH matched AS (
             SELECT order_id,
                    MIN(product_title)  AS product_title,
                    MIN(sku)            AS sku,
                    MIN(account_source) AS account_source,
                    MIN(status)         AS status,
                    MAX(order_date)     AS order_date,
                    COUNT(*)::int       AS item_count
               FROM orders
              WHERE organization_id = $1
                AND (
                  order_id ILIKE $2
                  OR upper(regexp_replace(order_id, '[^A-Za-z0-9]', '', 'g')) LIKE '%' || $3 || '%'
                  OR product_title ILIKE $2
                  OR sku ILIKE $2
                )
              GROUP BY order_id
              ORDER BY MAX(order_date) DESC NULLS LAST
              LIMIT 20
           )
           SELECT m.order_id,
                  m.product_title,
                  m.sku,
                  m.account_source,
                  m.status,
                  m.order_date::text AS order_date,
                  m.item_count,
                  COALESCE(
                    (SELECT CASE
                              WHEN NULLIF(i.image_document_id, '') IS NOT NULL
                                THEN '/api/zoho/items/' || i.zoho_item_id || '/image'
                              ELSE NULLIF(i.image_url, '')
                            END
                       FROM items i
                      WHERE i.sku = m.sku
                        AND i.organization_id = $1
                        AND i.status = 'active'
                      LIMIT 1),
                    (SELECT sc.image_url
                       FROM sku_catalog sc
                      WHERE sc.sku = m.sku
                        AND sc.organization_id = $1
                        AND NOT EXISTS (SELECT 1 FROM items i
                                         WHERE i.sku = sc.sku
                                           AND i.organization_id = sc.organization_id
                                           AND i.status = 'active')
                      LIMIT 1)
                  ) AS image_url
             FROM matched m
            ORDER BY m.order_date DESC NULLS LAST`,
          [ctx.organizationId, like, norm],
        )
      ).rows
    : [];

  return NextResponse.json({
    success: true,
    candidates: rows.map((r) => ({
      zoho_purchaseorder_id: String(r.zoho_purchaseorder_id),
      zoho_purchaseorder_number: r.zoho_purchaseorder_number,
      reference_number: r.reference_number,
      vendor_name: r.vendor_name,
      status: r.status,
    })),
    orders: orderRows.map((r) => ({
      order_id: String(r.order_id),
      product_title: r.product_title,
      sku: r.sku,
      account_source: r.account_source,
      status: r.status,
      order_date: r.order_date,
      item_count: Number(r.item_count) || 1,
      image_url: r.image_url,
    })),
  });
}, { permission: 'receiving.scan_po' });
