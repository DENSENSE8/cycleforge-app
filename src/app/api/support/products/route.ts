/**
 * GET /api/support/products — catalog products for support surfaces (the
 * ticket composer's "Product sent to customer" picker, its thread cards, the
 * product peek). Same search + face as the order-intake picker
 * (`searchIntakeProducts` / `readIntakeProductsByIds`, identity-law compliant),
 * gated by `integrations.zendesk` because support staff may lack `orders.create`.
 *
 *   ?q=bose            → search
 *   ?ids=12,40         → faces for known catalog ids
 *   ?sku=ABC-1         → one face by SKU (the `sku` detail-stack peek)
 *   ?ticketId=10092    → nothing typed yet: the ticket's linked products, else recent picks
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SupportProductsQuery } from '@/lib/schemas/support-ticket-items';
import { readIntakeProductsByIds, searchIntakeProducts } from '@/lib/orders/intake-product-search';
import { suggestTicketProducts } from '@/lib/support/ticket-items';
import type { SupportProductFace, SupportProductsResponse } from '@/lib/support/ticket-items-shared';
import { tenantQuery } from '@/lib/tenancy/db';

export const runtime = 'nodejs';

const SEARCH_LIMIT = 10;

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const sp = new URL(req.url).searchParams;
    const ids = (sp.get('ids') ?? '').split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
    const ticketId = Number(sp.get('ticketId'));
    const parsed = parseBody(SupportProductsQuery, {
      q: sp.get('q') ?? undefined,
      ids: ids.length ? ids : undefined,
      sku: sp.get('sku') ?? undefined,
      ticketId: ticketId > 0 ? ticketId : undefined,
    });
    if (parsed instanceof NextResponse) return parsed;

    const orgId = ctx.organizationId;
    const face = ({ skuCatalogId, sku, title, imageUrl, onHand, bin }: SupportProductFace) => ({
      skuCatalogId, sku, title, imageUrl, onHand, bin,
    });
    let body: SupportProductsResponse;
    if (parsed.ids?.length) {
      body = { source: 'ids', products: (await readIntakeProductsByIds(orgId, parsed.ids)).map(face) };
    } else if (parsed.sku) {
      const { rows } = await tenantQuery<{ id: number }>(
        orgId,
        `SELECT id FROM sku_catalog WHERE organization_id = $1 AND sku = $2 LIMIT 1`,
        [orgId, parsed.sku],
      );
      const products = rows[0] ? await readIntakeProductsByIds(orgId, [Number(rows[0].id)]) : [];
      body = { source: 'sku', products: products.map(face) };
    } else if (parsed.q && parsed.q.length >= 2) {
      body = { source: 'search', products: (await searchIntakeProducts(orgId, parsed.q, SEARCH_LIMIT)).map(face) };
    } else {
      body = await suggestTicketProducts({
        orgId,
        zendeskTicketId: parsed.ticketId ?? null,
        staffId: ctx.staffId ?? null,
      });
    }
    return NextResponse.json(body);
  },
  { permission: 'integrations.zendesk' },
);
