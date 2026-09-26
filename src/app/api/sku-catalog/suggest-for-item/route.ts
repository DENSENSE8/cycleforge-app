import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';

/** GET /api/sku-catalog/suggest-for-item?title=...&limit=5 */

interface SuggestionRow {
  id: number;
  sku: string;
  product_title: string;
  category: string | null;
  image_url: string | null;
  confidence: number;
  sim: string;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || '').trim();
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 5), 1), 20);

  // No title to match against → nothing to suggest (not an error).
  if (!title) {
    return NextResponse.json({ success: true, suggestions: [] });
  }

  const { rows } = await tenantQuery<SuggestionRow>(
    ctx.organizationId,
    `SELECT id, sku, product_title, category, image_url, confidence, sim
         FROM (
           SELECT id, sku, product_title, category, image_url,
                  LEAST(95, GREATEST(0, ROUND(similarity(product_title, $1) * 85)::int)) AS confidence,
                  ROUND(similarity(product_title, $1)::numeric, 2)::text AS sim
             FROM sku_catalog
            WHERE is_active = true
              AND organization_id = $3
              AND product_title % $1
         ) s
        WHERE s.confidence >= 40
        ORDER BY s.confidence DESC, s.product_title
        LIMIT $2`,
    [title, limit, ctx.organizationId],
  );

  return NextResponse.json({
    success: true,
    suggestions: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      product_title: r.product_title,
      category: r.category,
      image_url: r.image_url,
      confidence: r.confidence,
      reason: `trigram_${r.sim}`,
    })),
  });
}, { permission: 'sku_stock.view' });
