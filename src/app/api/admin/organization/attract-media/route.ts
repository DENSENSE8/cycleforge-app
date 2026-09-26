/** POST/DELETE /api/admin/organization/attract-media */

import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization, updateOrgSettings } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  ATTRACT_ALLOWED_MIME,
  ATTRACT_BLOB_CACHE_MAX_AGE_SEC,
  attractBlobKey,
  attractMediaMaxBytes,
  isOrgAttractBlobUrl,
  sanitizeAttractFileName,
} from '@/lib/kiosk/attract-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function replaceAttractUrl(orgId: OrgId, nextUrl: string): Promise<string | null> {
  const org = await getOrganization(orgId);
  if (!org) return null;
  const previous = String(org.settings.brand?.attractMediaUrl ?? '').trim();
  const nextBrand = {
    ...(org.settings.brand ?? {}),
    attractMediaUrl: nextUrl,
  };
  await updateOrgSettings(orgId, { brand: nextBrand });
  return previous || null;
}

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  if (!orgId) {
    return NextResponse.json({ error: 'Organization required' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'multipart body required' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }

  const mime = (file.type || '').toLowerCase();
  if (!ATTRACT_ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: 'Unsupported type. Use JPEG, PNG, WebP, GIF, MP4, or WebM.' },
      { status: 415 },
    );
  }

  const maxBytes = attractMediaMaxBytes(mime);
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: mime.startsWith('video/')
          ? 'Video exceeds 50MB limit'
          : 'Image exceeds 8MB limit',
      },
      { status: 413 },
    );
  }

  const safeName = sanitizeAttractFileName(file.name);
  const blobKey = attractBlobKey(orgId, safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await put(blobKey, buffer, {
    access: 'public',
    contentType: mime,
    cacheControlMaxAge: ATTRACT_BLOB_CACHE_MAX_AGE_SEC,
  });

  const previous = await replaceAttractUrl(orgId, uploaded.url);
  if (previous === null) {
    try {
      await del(uploaded.url);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  if (previous && previous !== uploaded.url && isOrgAttractBlobUrl(previous, orgId)) {
    try {
      await del(previous);
    } catch {
      /* stale blob is harmless */
    }
  }

  return NextResponse.json({ ok: true, attractMediaUrl: uploaded.url });
}, { permission: 'admin.view' });

export const DELETE = withAuth(async (_request: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  if (!orgId) {
    return NextResponse.json({ error: 'Organization required' }, { status: 400 });
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const previous = String(org.settings.brand?.attractMediaUrl ?? '').trim();
  const nextBrand = {
    ...(org.settings.brand ?? {}),
    attractMediaUrl: '',
  };
  await updateOrgSettings(orgId, { brand: nextBrand });

  if (previous && isOrgAttractBlobUrl(previous, orgId)) {
    try {
      await del(previous);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true, attractMediaUrl: '' });
}, { permission: 'admin.view' });
