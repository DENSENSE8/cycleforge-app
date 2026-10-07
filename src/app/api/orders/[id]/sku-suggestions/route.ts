import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { confirmLineSku, LineSkuConfirmError, suggestLineSkus } from '@/lib/orders/line-sku-suggest';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET  — catalog SKUs an order line (no `sku_catalog_id`) most likely is.
 * POST — the operator confirms one: the line gets the SKU, and a line with an
 *        item number teaches the listing → SKU mapping. See `line-sku-suggest.ts`.
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;
  const lineId = parseId((await params).id);
  if (lineId == null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  try {
    const result = await suggestLineSkus(gate.ctx.organizationId as OrgId, lineId);
    if (!result) return NextResponse.json({ error: 'Order line not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[GET /api/orders/[id]/sku-suggestions] error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read SKU suggestions' }, { status: 500 });
  }
}

const ConfirmBody = z.object({ skuCatalogId: z.number().int().positive() }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const lineId = parseId((await params).id);
  if (lineId == null) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  const parsed = parseBody(ConfirmBody, await req.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;

  const orgId = gate.ctx.organizationId as OrgId;
  try {
    const result = await confirmLineSku(orgId, { lineId, skuCatalogId: parsed.skuCatalogId, staffId: gate.ctx.staffId ?? null });
    await invalidateAllOrdersApiCaches(['shipped', 'orders-next', 'desk-pick-logs', 'packing-logs'], orgId);
    await publishOrderChanged({ organizationId: orgId, orderIds: [lineId], source: 'orders.sku-confirm' });
    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-sku-confirm',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: lineId,
      after: { skuCatalogId: parsed.skuCatalogId, sku: result.sku, learned: result.learned },
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof LineSkuConfirmError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/orders/[id]/sku-suggestions] error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not link the SKU' }, { status: 500 });
  }
}
