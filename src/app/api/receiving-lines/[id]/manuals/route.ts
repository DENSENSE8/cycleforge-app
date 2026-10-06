import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { resolveLineCatalog, resolveOrCreateLineCatalog } from '@/lib/receiving/line-catalog';
import {
  OrderManualError,
  linkManualToCatalogInTx,
  settleManualRepair,
  unlinkManualFromCatalogInTx,
} from '@/lib/manuals/order-manuals';

/** Pair / unpair a library manual to the SKU catalog row resolved from a receiving line (`product_manuals` SKU key). */
function lineIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  // .../api/receiving-lines/[id]/manuals → id is segments[-2]
  return Number(segments[segments.length - 2]);
}

async function manualIdFromBody(request: Request): Promise<number> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* tolerate empty */
  }
  return Number(body.manualId);
}

function manualErrorResponse(error: unknown): NextResponse {
  if (error instanceof OrderManualError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  throw error;
}

export const POST = withAuth(async (request, ctx) => {
  const lineId = lineIdFromPath(request.nextUrl.pathname);
  const manualId = await manualIdFromBody(request);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid line id' }, { status: 400 });
  }
  if (!Number.isFinite(manualId) || manualId <= 0) {
    return NextResponse.json({ ok: false, error: 'manualId is required' }, { status: 400 });
  }

  const resolved = await resolveOrCreateLineCatalog(lineId, ctx.organizationId);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'line not found' }, { status: 404 });
  }
  const skuCatalogId = resolved.skuCatalogId;
  if (skuCatalogId == null) {
    return NextResponse.json(
      { ok: false, error: 'could not resolve or create a catalog entry for this SKU' },
      { status: 409 },
    );
  }
  try {
    const manual = await withTenantTransaction(ctx.organizationId, (client) =>
      linkManualToCatalogInTx(client, ctx.organizationId, manualId, skuCatalogId),
    );
    await settleManualRepair(ctx.organizationId);
    return NextResponse.json({ ok: true, skuCatalogId, manual });
  } catch (error) {
    return manualErrorResponse(error);
  }
}, {
  permission: 'tech.qc_pass',
  audit: {
    source: 'tech',
    action: 'manual.pair',
    entityType: 'product_manual',
    entityId: ({ body }) => (body as { manualId?: number })?.manualId ?? null,
  },
});

export const DELETE = withAuth(async (request, ctx) => {
  const lineId = lineIdFromPath(request.nextUrl.pathname);
  const manualId = await manualIdFromBody(request);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid line id' }, { status: 400 });
  }
  if (!Number.isFinite(manualId) || manualId <= 0) {
    return NextResponse.json({ ok: false, error: 'manualId is required' }, { status: 400 });
  }

  const resolved = await resolveLineCatalog(lineId, ctx.organizationId);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'line not found' }, { status: 404 });
  }
  const skuCatalogId = resolved.skuCatalogId;
  if (skuCatalogId == null) {
    return NextResponse.json({ ok: false, error: 'Manual is not paired to this SKU' }, { status: 404 });
  }
  try {
    const before = await withTenantTransaction(ctx.organizationId, (client) =>
      unlinkManualFromCatalogInTx(client, ctx.organizationId, manualId, skuCatalogId),
    );
    await settleManualRepair(ctx.organizationId);
    return NextResponse.json({ ok: true, manual: { manualId, before } });
  } catch (error) {
    return manualErrorResponse(error);
  }
}, {
  permission: 'tech.qc_pass',
  audit: {
    source: 'tech',
    action: 'manual.unpair',
    entityType: 'product_manual',
    entityId: ({ body }) => (body as { manualId?: number })?.manualId ?? null,
  },
});
