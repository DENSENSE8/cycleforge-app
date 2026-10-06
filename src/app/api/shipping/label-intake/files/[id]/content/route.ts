import { NextResponse, type NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { readLabelBatchOriginal } from '@/lib/label-batches/batches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/shipping/label-intake/files/[id]/content — the ORIGINAL uploaded PDF (the file's preview). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'shipping.view');
  if (gate.denied) return gate.denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid file id.' }, { status: 400 });
  const original = await readLabelBatchOriginal(gate.ctx.organizationId, id);
  if (!original) return NextResponse.json({ error: 'No stored original for this file.' }, { status: 404 });
  return new Response(new Uint8Array(original.bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${original.fileName.replace(/["\\\r\n]/g, '_')}"`,
      'cache-control': 'private, no-store',
    },
  });
}
