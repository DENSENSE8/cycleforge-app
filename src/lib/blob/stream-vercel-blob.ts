import 'server-only';

import { NextResponse } from 'next/server';
import { isVercelBlobUrl } from './vercel-blob-url';

/**
 * MIME types we are willing to emit on the app origin with an `inline`
 * disposition. Deliberately narrow (no `text/*`, no `image/svg+xml`): the app
 * ships no `script-src` CSP, so anything scriptable served inline here runs
 * with full session reach. Mirrors `ALLOWED_MIME` in `lib/photos/service.ts`.
 */
export const INLINE_SAFE_MIME: Record<string, true> = {
  'application/pdf': true,
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
};

/**
 * Normalize a `Content-Type` header to its bare type and report whether it is
 * safe to serve inline on our origin.
 */
export function clampInlineMime(raw: string | null | undefined): {
  contentType: string;
  inlineSafe: boolean;
} {
  const bare = String(raw || '').split(';')[0].trim().toLowerCase();
  return INLINE_SAFE_MIME[bare]
    ? { contentType: bare, inlineSafe: true }
    : { contentType: 'application/octet-stream', inlineSafe: false };
}

/**
 * Fetch a Vercel Blob object and return it as a same-origin response.
 *
 * Direct blob URLs send `Content-Security-Policy: default-src 'none'` (and
 * historically `X-Frame-Options: DENY`). That is fine for a top-level tab
 * and for `<img>`/`<video>`, but Chrome's PDF viewer inside our iframes
 * paints a blank frame. Streaming through our origin drops those headers
 * so manuals, pack inserts, and print embeds actually render.
 *
 * Only Vercel Blob hosts are fetched — this is not an open HTTP proxy — and
 * the emitted content-type is clamped to `INLINE_SAFE_MIME`. A blob stored
 * with any other type (e.g. a legacy `text/html` upload) is downgraded to
 * `application/octet-stream` + `attachment`, so it can never execute here.
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
  const { contentType, inlineSafe } = clampInlineMime(
    upstream.headers.get('content-type') || opts.fallbackContentType,
  );
  const safeName = (opts.filename || 'file').replace(/[\r\n"]/g, '');
  const disposition = `${opts.download || !inlineSafe ? 'attachment' : 'inline'}; filename="${safeName}"`;

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
