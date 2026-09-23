/**
 * GET /api/repair/ecwid-products — staff repair catalog.
 *
 * Walks the live Ecwid storefront (`fetchRepairRootProductsCached`), unlike the
 * kiosk twin, which reads the local projection. The query grammar is therefore
 * the smaller one: `?mode=all` · `?mode=favorites` · `?categoryId=`.
 *
 * `mode=favorites` narrows the cached root list to the repair workspace's
 * curated SKUs, in `sort_order`, so the staff picker lands on the SAME list as
 * the kiosk rail. The filter is in JS because this source has no SQL to filter;
 * `selectFavoriteCatalogProducts` is shared with the kiosk path so the two can
 * never disagree about order.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  type EcwidProduct,
  resolveEcwidStoreCreds,
  fetchRepairRootProductsCached,
} from '@/lib/repair/ecwid-repair-catalog';
import { listFavoriteSkuKeys } from '@/lib/favorites/sku-favorites';
import { selectFavoriteCatalogProducts } from '@/lib/favorites/favorite-sku-key';

export type { EcwidProduct };

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';

interface EcwidRawProduct {
  id?: number | string;
  name?: string | null;
  sku?: string | null;
  price?: number | null;
  thumbnailUrl?: string | null;
  enabled?: boolean;
  inStock?: boolean;
  categoryIds?: (number | string)[];
  [key: string]: unknown;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { storeId, token } = resolveEcwidStoreCreds();

    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 10);
    const offsetRaw = Number(req.nextUrl.searchParams.get('offset') || 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 10;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    const mode = String(req.nextUrl.searchParams.get('mode') || '').trim().toLowerCase();
    const categoryId = req.nextUrl.searchParams.get('categoryId');

    if (mode === 'all') {
      const filtered = await fetchRepairRootProductsCached(storeId, token, ctx.organizationId);

      const page = filtered.slice(offset, offset + limit);
      const hasMore = offset + page.length < filtered.length;

      return NextResponse.json(
        { success: true, products: page, total: filtered.length, limit, offset, hasMore },
        { headers: { 'Cache-Control': 'private, max-age=120' } }
      );
    }

    if (mode === 'favorites') {
      const [root, favoriteKeys] = await Promise.all([
        fetchRepairRootProductsCached(storeId, token, ctx.organizationId),
        listFavoriteSkuKeys('repair', ctx.organizationId),
      ]);
      const favorites = selectFavoriteCatalogProducts(root, favoriteKeys);

      const page = favorites.slice(offset, offset + limit);
      const hasMore = offset + page.length < favorites.length;

      // No shared caching: a star on a tile must show on the next paint, and
      // the list is small enough that the cached root walk is the only cost.
      return NextResponse.json(
        { success: true, products: page, total: favorites.length, limit, offset, hasMore },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    if (!categoryId) {
      return NextResponse.json({ success: false, error: 'categoryId is required' }, { status: 400 });
    }

    const page = await fetchProductsByCategoryPage(storeId, token, categoryId, limit, offset);
    const hasMore = offset + page.products.length < page.total;

    return NextResponse.json(
      { success: true, products: page.products, total: page.total, limit, offset, hasMore },
      { headers: { 'Cache-Control': 'private, max-age=120' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Ecwid repair products error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'repair.intake' });

async function fetchProductsByCategoryPage(
  storeId: string,
  token: string,
  categoryId: string,
  limit: number,
  offset: number
): Promise<{ products: EcwidProduct[]; total: number }> {
  const url = new URL(`${ECWID_BASE_URL}/${storeId}/products`);
  url.searchParams.set('category', categoryId);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('enabled', 'true');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ecwid products request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { items?: EcwidRawProduct[]; total?: number } | EcwidRawProduct[];
  const pageItems: EcwidRawProduct[] = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : [];
  const total = Array.isArray(data) ? pageItems.length : Number.isFinite(data.total) ? Number(data.total) : pageItems.length;

  const products: EcwidProduct[] = pageItems
    .map((item) => {
      const id = item.id != null ? String(item.id) : null;
      if (!id) return null;

      return {
        id,
        name: String(item.name || '').trim() || `Product ${id}`,
        sku: String(item.sku || '').trim(),
        price: typeof item.price === 'number' ? item.price : null,
        thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
        enabled: item.enabled !== false,
        inStock: item.inStock !== false,
        categoryIds: Array.isArray(item.categoryIds)
          ? item.categoryIds.map((cid) => String(cid))
          : [],
      };
    })
    .filter((item): item is EcwidProduct => Boolean(item));

  return { products, total };
}
