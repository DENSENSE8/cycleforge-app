import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { isVercelBlobUrl } from '@/lib/blob/vercel-blob-url';
import { streamVercelBlobResponse } from '@/lib/blob/stream-vercel-blob';
import { isSafeExternalUrl } from '@/lib/security/safe-external-url';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/sku-kit-parts/[id]/document
 *
 * Same-origin preview for a kit-part insert (PDF/image on Vercel Blob).
 * Packers cannot use `/api/documents/:id/content` (`orders.view`); this route
 * is session + org-scoped so the pack slide-over can iframe the file.
 */

function partIdFromPath(pathname: string): number | null {
  // /api/sku-kit-parts/:id/document
  const segs = pathname.split('/').filter(Boolean);
  const docIdx = segs.lastIndexOf('document');
  const id = Number(segs[docIdx - 1] || '');
  return Number.isFinite(id) && id > 0 ? id : null;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const partId = partIdFromPath(req.nextUrl.pathname);
  if (partId === null) {
    return NextResponse.json({ error: 'Invalid kit-part id' }, { status: 400 });
  }

  const orgId = ctx.organizationId as OrgId;
  const download = req.nextUrl.searchParams.get('download') === '1';

  const res = await tenantQuery<{
    document_url: string | null;
    document_title: string | null;
    document_mime: string | null;
    component_name: string | null;
  }>(
    orgId,
    `SELECT document_url, document_title, document_mime, component_name
       FROM sku_kit_parts
      WHERE id = $1 AND organization_id = $2`,
    [partId, orgId],
  );
  const row = res.rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Kit part not found' }, { status: 404 });
  }

  const url = String(row.document_url || '').trim();
  if (!url.startsWith('http')) {
    return NextResponse.json({ error: 'Insert has no stored content' }, { status: 404 });
  }

  const filename = `${row.document_title || row.component_name || `insert-${partId}`}.pdf`;
  const fallbackType = row.document_mime === 'image' ? 'image/jpeg' : 'application/pdf';

  if (isVercelBlobUrl(url)) {
    return streamVercelBlobResponse(url, {
      filename,
      download,
      fallbackContentType: fallbackType,
    });
  }

  // Stored open-redirect sink: `document_url` is operator-supplied, so the 302
  // target must be a public https host before we hand the browser to it.
  if (!isSafeExternalUrl(url)) {
    return NextResponse.json({ error: 'Insert source is not a permitted URL' }, { status: 400 });
  }

  return NextResponse.redirect(url, { status: 302 });
});
