import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { addPrepackKitPart, catalogIdFrom, pairingRefusal } from '@/lib/prepack/pairing';
import { PREPACK_KIT_PART_TYPES } from '@/lib/prepack/types';

const PartBody = z.object({
  componentName: z.string().trim().min(1, 'Part name is required').max(200),
  componentType: z.enum(PREPACK_KIT_PART_TYPES),
  qtyRequired: z.number().int().min(1).max(999),
  childSkuCatalogId: z.number().int().positive().nullable(),
});

/** Add one part to the product's list, optionally paired to a child SKU; answers the fresh kit. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.manage');
  if (gate.denied) return gate.denied;
  const id = await catalogIdFrom(params);
  if (id == null) {
    return NextResponse.json({ success: false, error: 'Invalid catalog id' }, { status: 400 });
  }
  const parsed = PartBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid part' },
      { status: 400 },
    );
  }
  try {
    const kit = await addPrepackKitPart(gate.ctx.organizationId, id, parsed.data, gate.ctx.staffId);
    return NextResponse.json({ success: true, ...kit });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (refusal) return NextResponse.json({ success: false, error: refusal.message }, { status: refusal.status });
    console.error('Error in POST /api/prepack/catalog/[id]/parts:', error);
    return NextResponse.json({ success: false, error: 'Failed to add the part' }, { status: 500 });
  }
}
