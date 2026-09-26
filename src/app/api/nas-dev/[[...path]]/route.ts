import { NextRequest, NextResponse } from 'next/server';
import { stat, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, sep, extname, dirname } from 'node:path';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Local NAS file server — the app reads the NAS folder straight off the SMB mount and re-exposes it to the browser, so no separate… */

// The folder the host has mounted (SMB share "USAV Media"). Set NAS_DEV_ROOT to
// THIS machine's mount path — it differs per OS (macOS: /Volumes/...,
// Windows: a mapped drive / UNC path, Linux: the CIFS mountpoint).
const DEFAULT_ROOT = '/Volumes/USAV Media/Puchasing photos/2026';
const ROOT = resolve(/* turbopackIgnore: true */ process.env.NAS_DEV_ROOT || DEFAULT_ROOT);

// On in production unless explicitly opted in via NAS_DEV_ROOT (see header).
const ENABLED = Boolean(process.env.NAS_DEV_ROOT) || process.env.NODE_ENV !== 'production';

// Only web-renderable image formats are listed as files (HEIC is excluded the
// same way the client lib excludes it — browsers can't render it).
const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// Noise we never want to surface in the picker.
function isHidden(name: string): boolean {
  return (
    name.startsWith('.') ||
    name === '#recycle' ||
    name.toLowerCase() === 'thumbs.db'
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  // Real session + permission gate. The edge proxy only checks cookie
  // PRESENCE, so this handler must enforce auth itself (mirrors the prod
  // /api/nas route). Without it, anyone could read the mounted NAS share.
  const gate = await requireRoutePerm(req, 'receiving.view');
  if (gate.denied) return gate.denied;
  if (!ENABLED) {
    return NextResponse.json(
      { error: 'nas-dev is disabled (set NAS_DEV_ROOT to enable in a production build)' },
      { status: 404 },
    );
  }

  const { path: segments = [] } = await params;
  // Next.js URL-decodes catch-all segments, so spaces in "JAN 2026" arrive intact.
  const target = resolve(/* turbopackIgnore: true */ ROOT, segments.join('/'));

  // Path-traversal guard: the resolved path must stay inside ROOT.
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let info;
  try {
    info = await stat(/* turbopackIgnore: true */ target);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // ── Directory → nginx-autoindex-compatible JSON listing ──────────────────
  if (info.isDirectory()) {
    const names = await readdir(/* turbopackIgnore: true */ target);
    const entries = await Promise.all(
      names.filter((n) => !isHidden(n)).map(async (name) => {
        try {
          const s = await stat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ target, name));
          const isDir = s.isDirectory();
          if (!isDir && !IMAGE_RE.test(name)) return null; // skip non-image files
          return {
            name,
            type: isDir ? 'directory' : 'file',
            size: s.size,
            mtime: s.mtime.toISOString(),
          };
        } catch {
          return null; // unreadable entry — drop it rather than fail the listing
        }
      }),
    );
    return NextResponse.json(entries.filter(Boolean), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // ── File → stream the image bytes ────────────────────────────────────────
  const ext = extname(target).toLowerCase();
  const buf = await readFile(/* turbopackIgnore: true */ target);

  // Optional on-the-fly thumbnail (?thumb=<px>):
  const thumbRaw = req.nextUrl.searchParams.get('thumb');
  if (thumbRaw && IMAGE_RE.test(target)) {
    const size = Math.min(512, Math.max(48, Number(thumbRaw) || 160));
    try {
      // Keep this a genuine runtime import.
      type SharpChain = {
        rotate(): SharpChain;
        resize(w: number, h: number, o: { fit: string }): SharpChain;
        webp(o: { quality: number }): SharpChain;
        toBuffer(): Promise<Buffer>;
      };
      const sharpPackage = ['sh', 'arp'].join('');
      const sharpModule = await import(/* webpackIgnore: true */ sharpPackage);
      const sharp = sharpModule.default as (input: Buffer) => SharpChain;
      const out = await sharp(buf)
        .rotate()
        .resize(size, size, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer();
      return new NextResponse(new Uint8Array(out), {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=600' },
      });
    } catch {
      // sharp missing / decode failure → serve the original below.
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}

/** Write one captured photo to the mounted NAS folder (the local-dev equivalent of a WebDAV PUT against the real NAS). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  // Writes require the upload permission (mirrors the prod /api/nas route).
  const gate = await requireRoutePerm(req, 'receiving.upload_photo');
  if (gate.denied) return gate.denied;
  if (!ENABLED) {
    return NextResponse.json(
      { error: 'nas-dev is disabled (set NAS_DEV_ROOT to enable in a production build)' },
      { status: 404 },
    );
  }

  const { path: segments = [] } = await params;
  const target = resolve(ROOT, segments.join('/'));

  // Path-traversal guard: the resolved path must stay inside ROOT, and we only
  // accept web-renderable image files (no arbitrary writes).
  if (!target.startsWith(ROOT + sep)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!IMAGE_RE.test(target)) {
    return NextResponse.json({ error: 'only image files are allowed' }, { status: 400 });
  }

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) {
    return NextResponse.json({ error: 'empty body' }, { status: 400 });
  }

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(body));
  } catch {
    return NextResponse.json({ error: 'write failed' }, { status: 500 });
  }

  // 201 Created — the nas-photos client treats 200/201/204 as success.
  return new NextResponse(null, { status: 201 });
}
