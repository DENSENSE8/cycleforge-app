import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getProductManualById } from '@/lib/neon/product-manuals-queries';
import { isVercelBlobUrl } from '@/lib/blob/vercel-blob-url';
import { streamVercelBlobResponse } from '@/lib/blob/stream-vercel-blob';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/product-manuals/[id]/content
 *
 * Same-origin bytes for iframe / embed preview (pack print, manuals library,
 * testing slide-over). Vercel Blob's own CSP blanks PDFs framed on our origin,
 * so we stream rather than 302.
 *
 * Session-only (no `orders.view`): testers and packers already receive
 * `source_url` from their surfaces; this route must not 403 them.
 */

function manualIdFromPath(pathname: string): number | null {
  // /api/product-manuals/:id/content
  const segs = pathname.split('/').filter(Boolean);
  const contentIdx = segs.lastIndexOf('content');
  const raw = segs[contentIdx - 1] || '';
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const manualId = manualIdFromPath(req.nextUrl.pathname);
  if (manualId === null) {
    return NextResponse.json({ error: 'Invalid manual id' }, { status: 400 });
  }

  const orgId = ctx.organizationId as OrgId;
  const download = req.nextUrl.searchParams.get('download') === '1';

  try {
    const manual = await getProductManualById(manualId, orgId);
    if (!manual || !manual.is_active) {
      return NextResponse.json({ error: 'Manual not found' }, { status: 404 });
    }

    const url = String(manual.source_url || '').trim();
    if (!url.startsWith('http')) {
      return NextResponse.json({ error: 'Manual has no stored content' }, { status: 404 });
    }

    const filename = manual.file_name || `${manual.display_name || `manual-${manualId}`}.pdf`;
    const fallbackType = filename.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'application/octet-stream';

    if (isVercelBlobUrl(url)) {
      return streamVercelBlobResponse(url, {
        filename,
        download,
        fallbackContentType: fallbackType,
      });
    }

    // External PDFs need the same-origin path too: the mobile preview fetches
    // this URL, and a redirect to a third-party PDF fails CORS before it paints.
    // Non-PDF previews retain their original external navigation behavior.
    if (!download && !filename.toLowerCase().endsWith('.pdf')) {
      return NextResponse.redirect(url, { status: 302 });
    }

    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch manual bytes' }, { status: 502 });
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const headerType = res.headers.get('content-type') || '';
    const mime =
      headerType.includes('pdf') || filename.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : headerType || 'application/octet-stream';
    return new NextResponse(bytes, {
      headers: {
        'content-type': mime,
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/[\r\n"]/g, '')}"`,
        'content-length': String(bytes.length),
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[GET /api/product-manuals/[id]/content]', err);
    return NextResponse.json({ error: 'Failed to load manual' }, { status: 500 });
  }
});
