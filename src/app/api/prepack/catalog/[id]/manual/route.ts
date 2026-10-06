import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { catalogIdFrom, linkPrepackManual, pairingRefusal, removePrepackManual } from '@/lib/prepack/pairing';
import type { PrepackManualRemoveInput } from '@/lib/prepack/types';

const ManualBody = z.object({ manualId: z.number().int().positive() });

/** Pair an existing library manual to this product at SKU level; answers the fresh kit. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'product_manuals.manage');
  if (gate.denied) return gate.denied;
  const id = await catalogIdFrom(params);
  if (id == null) {
    return NextResponse.json({ success: false, error: 'Invalid catalog id' }, { status: 400 });
  }
  const parsed = ManualBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'manualId is required' }, { status: 400 });
  }
  try {
    const kit = await linkPrepackManual(gate.ctx.organizationId, id, parsed.data.manualId, gate.ctx.staffId);
    return NextResponse.json({ success: true, ...kit });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (refusal) return NextResponse.json({ success: false, error: refusal.message }, { status: refusal.status });
    console.error('Error in POST /api/prepack/catalog/[id]/manual:', error);
    return NextResponse.json({ success: false, error: 'Failed to pair the manual' }, { status: 500 });
  }
}

const RemoveBody = z.object({
  manualId: z.number().int().positive(),
  mode: z.enum(['unpair', 'delete']),
}) satisfies z.ZodType<PrepackManualRemoveInput>;

/** Unpair this product's manual (back to the library) or soft-delete it; answers the fresh kit. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'product_manuals.manage');
  if (gate.denied) return gate.denied;
  const id = await catalogIdFrom(params);
  if (id == null) {
    return NextResponse.json({ success: false, error: 'Invalid catalog id' }, { status: 400 });
  }
  const parsed = RemoveBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'manualId and mode (unpair | delete) are required' }, { status: 400 });
  }
  try {
    const kit = await removePrepackManual(gate.ctx.organizationId, id, parsed.data, gate.ctx.staffId);
    return NextResponse.json({ success: true, ...kit });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (refusal) return NextResponse.json({ success: false, error: refusal.message }, { status: refusal.status });
    console.error('Error in DELETE /api/prepack/catalog/[id]/manual:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove the manual' }, { status: 500 });
  }
}
