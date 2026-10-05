import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { loadPrepackKit } from '@/lib/prepack/server';
import { tenantQuery } from '@/lib/tenancy/db';

const MpnBody = z.object({
  mpn: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((value) => (value ? value : null)),
});

async function catalogIdFrom(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The chosen catalog SKU's physical kit template. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const id = await catalogIdFrom(params);
  if (id == null) {
    return NextResponse.json({ success: false, error: 'Invalid catalog id' }, { status: 400 });
  }
  const kit = await loadPrepackKit(gate.ctx.organizationId, id);
  if (!kit) return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...kit });
}

/**
 * Record the catalog product's manufacturer part number. MPN only — title and
 * image belong to the provider item (sku-identity law) and are never written here.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.adjust');
  if (gate.denied) return gate.denied;
  const id = await catalogIdFrom(params);
  if (id == null) {
    return NextResponse.json({ success: false, error: 'Invalid catalog id' }, { status: 400 });
  }
  const parsed = MpnBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'MPN must be text of 80 characters or fewer' },
      { status: 400 },
    );
  }
  const orgId = gate.ctx.organizationId;
  const updated = await tenantQuery(
    orgId,
    `UPDATE sku_catalog SET mpn = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3`,
    [parsed.data.mpn, id, orgId],
  );
  if (!updated.rowCount) {
    return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });
  }
  const kit = await loadPrepackKit(orgId, id);
  if (!kit) return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...kit });
}
