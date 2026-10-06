import { NextResponse, type NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { catalogIdFrom, pairingRefusal, uploadPrepackManual } from '@/lib/prepack/pairing';

// Word → PDF conversion runs in a sandbox (as /api/product-manuals/upload).
export const runtime = 'nodejs';
export const maxDuration = 120;

/** Upload a manual through the library upload and pair it to this product at SKU level; answers the fresh kit. */
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'multipart body required' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
  }
  try {
    const kit = await uploadPrepackManual(gate.ctx.organizationId, id, file, gate.ctx.staffId);
    return NextResponse.json({ success: true, ...kit });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (refusal) return NextResponse.json({ success: false, error: refusal.message }, { status: refusal.status });
    console.error('Error in POST /api/prepack/catalog/[id]/manual/upload:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload the manual' }, { status: 500 });
  }
}
