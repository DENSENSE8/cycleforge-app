import { NextRequest, NextResponse } from 'next/server';
import {
  getSkuCatalogBySku,
  getSkuCatalogList,
  setSkuCatalogHandlingFacts,
  upsertSkuCatalog,
  type SkuCatalogLinkFilter,
} from '@/lib/neon/sku-catalog-queries';
import { normalizeCatalogSku } from '@/lib/sku/catalog-import';
import { linkCatalogZohoItem, readCatalogImportContext } from '@/lib/sku/catalog-import-store';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SkuCatalogCreateBody } from '@/lib/schemas/sku-catalog';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { upsertSkuPackProfileLink } from '@/lib/neon/pack-profile-links';
import {
  connectedProviderKey,
  connectedProviderLabel,
} from '@/lib/integrations/capability-connections';

const ROUTE_SKU_CATALOG_POST = 'sku-catalog.post';

function parseLinkFilter(raw: string | null): SkuCatalogLinkFilter | undefined {
  if (raw === 'active_linked' || raw === 'unlinked_pending' || raw === 'all') return raw;
  return undefined;
}

/** GET /api/sku-catalog — Paginated SKU catalog list with platform/manual/QC counts. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const sort = searchParams.get('sort') || 'az';
  const dir = searchParams.get('dir') || 'asc';
  const ecwidOnly = searchParams.get('ecwidOnly') === 'true';
  const platform = searchParams.get('platform');
  const linkFilter = parseLinkFilter(searchParams.get('linkFilter'));

  const [{ items, total }, providerKey, providerLabel] = await Promise.all([
    getSkuCatalogList(
      { q, limit, offset, sort, dir, ecwidOnly, platform, linkFilter },
      ctx.organizationId,
    ),
    connectedProviderKey(ctx.organizationId, 'inventory'),
    connectedProviderLabel(ctx.organizationId, 'inventory'),
  ]);

  return NextResponse.json({
    success: true,
    items,
    total,
    inventoryProvider: providerKey
      ? { key: providerKey, label: providerLabel }
      : null,
  });
}, { permission: 'sku_stock.view' });

/** POST /api/sku-catalog — Create a new SKU catalog entry. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(SkuCatalogCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    // ─── Idempotency replay ─────────────────────────────────────────────────
    const idemKey = readIdempotencyKey(req, parsed.idempotencyKey ?? null);
    if (idemKey) {
      const hit = await getApiIdempotencyResponse(pool, ctx.organizationId, idemKey, ROUTE_SKU_CATALOG_POST);
      if (hit) {
        return NextResponse.json(hit.response_body, { status: hit.status_code });
      }
    }

    // Leading zeros restored (`1113` → `01113`) unless the SKU exists as written — the import's rule.
    const known = await readCatalogImportContext(ctx.organizationId, [parsed.sku]);
    const sku = normalizeCatalogSku(parsed.sku, (s) => known.catalogTitles.has(s) || known.mirrorItemIds.has(s));

    // True create semantics: reject if an active row already owns this sku.
    const existing = await getSkuCatalogBySku(sku, ctx.organizationId);
    if (existing && existing.is_active) {
      return NextResponse.json(
        { success: false, error: `SKU ${sku} is already in the catalog`, id: existing.id, sku },
        { status: 409 },
      );
    }

    // A padding/case twin of a catalog SKU (`89-P-1` beside `00089-P-1`) is
    // the same key to label resolution — refuse unless Zoho carries it as written.
    const twinSku = known.mirrorItemIds.has(sku)
      ? null
      : ((known.paddingTwins.get(parsed.sku) ?? []).find((twin) => twin !== sku) ?? null);
    if (twinSku) {
      return NextResponse.json(
        { success: false, error: `SKU ${sku} has the same key as catalog SKU ${twinSku}`, sku, twinSku },
        { status: 409 },
      );
    }

    // upsert reactivates a previously soft-deleted row or inserts a new one.
    const catalog = await upsertSkuCatalog({
      sku,
      productTitle: parsed.productTitle,
      category: parsed.category ?? null,
      upc: parsed.upc ?? null,
      ean: parsed.ean ?? null,
      imageUrl: parsed.imageUrl ?? null,
      isActive: parsed.isActive ?? true,
      lifecycleStatus: parsed.lifecycleStatus ?? null,
      reorderThreshold: parsed.reorderThreshold ?? null,
      lastKnownCostCents: parsed.lastKnownCostCents ?? null,
      sourcingNotes: parsed.sourcingNotes ?? null,
      replenishTargetCents: parsed.replenishTargetCents ?? null,
      notes: parsed.packNotes ?? null,
    }, ctx.organizationId);
    const catalogWithHandling = parsed.handlingFacts === undefined
      ? catalog
      : await setSkuCatalogHandlingFacts(catalog.id, parsed.handlingFacts, ctx.organizationId);
    if (!catalogWithHandling) {
      return NextResponse.json({ success: false, error: 'Could not save handling facts' }, { status: 500 });
    }
    if (parsed.zohoItemId) {
      await linkCatalogZohoItem(ctx.organizationId, {
        skuCatalogId: catalogWithHandling.id,
        sku: catalogWithHandling.sku,
        title: catalogWithHandling.product_title,
        zohoItemId: parsed.zohoItemId,
      });
    }
    if (parsed.packTier !== undefined || parsed.estimatedPackMinutes !== undefined) {
      await upsertSkuPackProfileLink(
        {
          skuCatalogId: catalogWithHandling.id,
          packTier: parsed.packTier ?? null,
          estimatedMinutes: parsed.estimatedPackMinutes ?? null,
          source: 'manual',
        },
        ctx.organizationId,
      );
    }

    await recordAudit(pool, ctx, req, {
      source: 'sku-catalog-api',
      action: AUDIT_ACTION.SKU_CATALOG_CREATE,
      entityType: AUDIT_ENTITY.SKU,
      entityId: catalogWithHandling.id,
      before: existing ? { ...existing } : null,
      after: { ...catalogWithHandling, zohoItemId: parsed.zohoItemId ?? null },
    });

    const responseBody = { success: true, catalog: catalogWithHandling };
    if (idemKey) {
      await saveApiIdempotencyResponse(pool, {
        orgId: ctx.organizationId,
        idempotencyKey: idemKey,
        route: ROUTE_SKU_CATALOG_POST,
        staffId: ctx.staffId,
        statusCode: 201,
        responseBody,
      });
    }

    await invalidateCacheTags(ctx.organizationId, [CACHE_TAGS.skuCatalog]);
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505' || /unique/i.test(error?.message || '')) {
      return NextResponse.json(
        { success: false, error: 'A SKU catalog entry with that sku already exists' },
        { status: 409 },
      );
    }
    console.error('Error in POST /api/sku-catalog:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create SKU catalog entry' },
      { status: 500 },
    );
  }
}, { permission: 'sku_stock.manage' });
