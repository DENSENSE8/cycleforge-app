import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getProductManualById } from '@/lib/neon/product-manuals-queries';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/product-manuals/[id]/content
 *
 * Same-origin content proxy for pack-bundle browser print fallback (Phase 2).
 * Redirects to source_url when present; 404 when the manual has no fetchable file.
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const manualId = parseId(rawId);
  if (manualId === null) {
    return NextResponse.json({ error: 'Invalid manual id' }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId as OrgId;
  const download = new URL(req.url).searchParams.get('download') === '1';

  try {
    const manual = await getProductManualById(manualId, orgId);
    if (!manual || !manual.is_active) {
      return NextResponse.json({ error: 'Manual not found' }, { status: 404 });
    }

    const url = String(manual.source_url || '').trim();
    if (!url.startsWith('http')) {
      return NextResponse.json({ error: 'Manual has no stored content' }, { status: 404 });
    }

    if (download) {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch manual bytes' }, { status: 502 });
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const headerType = res.headers.get('content-type') || '';
      const mime =
        headerType.includes('pdf') || manual.file_name?.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : headerType || 'application/octet-stream';
      const filename = manual.file_name || `${manual.display_name || `manual-${manualId}`}.pdf`;
      return new NextResponse(bytes, {
        headers: {
          'content-type': mime,
          'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
          'cache-control': 'private, max-age=300',
        },
      });
    }

    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error('[GET /api/product-manuals/[id]/content]', err);
    return NextResponse.json({ error: 'Failed to load manual' }, { status: 500 });
  }
}
