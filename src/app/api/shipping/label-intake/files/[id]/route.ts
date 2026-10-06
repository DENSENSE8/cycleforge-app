import { NextResponse, type NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getPrintFile } from '@/lib/label-prints/print-files';

export const dynamic = 'force-dynamic';

/** GET /api/shipping/label-intake/files/[id] — one file with its pages in page order (`PrintFileDetail`). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'shipping.view');
  if (gate.denied) return gate.denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid file id.' }, { status: 400 });
  const detail = await getPrintFile(gate.ctx.organizationId, id);
  if (!detail) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  return NextResponse.json(detail);
}
