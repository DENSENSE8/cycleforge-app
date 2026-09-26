import 'server-only';

import { NextResponse } from 'next/server';
import { isVercelBlobUrl } from './vercel-blob-url';

/**
 * Fetch a Vercel Blob object and return it as a same-origin response.
 * Direct blob URLs send `Content-Security-Policy: default-src 'none'` (and
 */
export async function streamVercelBlobResponse(
  url: string,
  opts: {
    filename?: string;
    download?: boolean;
    fallbackContentType?: string;
  } = {},
): Promise<NextResponse> {
  if (!isVercelBlobUrl(url)) {
    return NextResponse.json({ error: 'Not a Vercel Blob url' }, { status: 400 });
  }

  const upstream = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: 'Failed to fetch stored file' },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  const contentType =
    upstream.headers.get('content-type') ||
    opts.fallbackContentType ||
    'application/octet-stream';
  const safeName = (opts.filename || 'file').replace(/[\r\n"]/g, '');
  const disposition = `${opts.download ? 'attachment' : 'inline'}; filename="${safeName}"`;

  // Buffer the object. Chrome's PDF plugin (and Range probes) hang forever on
  // a streamed body with no Content-Length — the manuals iframe spinner.
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': disposition,
      'content-length': String(buf.length),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
