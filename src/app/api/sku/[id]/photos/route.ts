import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { photoContentUrl } from '@/lib/photos/display-url';
import { attachPhotoWithLegacyUrl, listPhotosForEntity, uploadPhoto } from '@/lib/photos/service';
import { addPhotosToListing, setListingCover } from '@/lib/photos/listing-photos';
import type { OrgId } from '@/lib/tenancy/constants';
import { publishEntityMediaInsert } from '@/lib/photos/publish-entity-media';

/**
 * GET  /api/sku/[id]/photos        — list photos for a catalog SKU (`sku_catalog.id`, entity `SKU`)
 * POST /api/sku/[id]/photos        — add a photo (bytes to GCS, URL for legacy imports).
 *   `role: 'primary'` also makes it the SKU listing cover — the product photo
 *   every record paints first (`productImageUrl`, decision 2026-09-29).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const { id } = await params;
  const skuId = Number(id);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return NextResponse.json({ error: 'Valid SKU id is required' }, { status: 400 });
  }

  try {
    const rows = await listPhotosForEntity({
      organizationId: orgId,
      entityType: 'SKU',
      entityId: skuId,
    });

    return NextResponse.json({
      photos: rows.map((row) => ({
        id: row.id,
        skuId,
        url: photoContentUrl(row.id),
        photoType: row.photoType,
        takenByStaffId: row.takenByStaffId,
        createdAt: row.createdAt,
      })),
    });
  } catch (err: unknown) {
    console.error('[sku/[id]/photos GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch SKU photos' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'receiving.upload_photo');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const { id } = await params;
  const skuId = Number(id);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return NextResponse.json({ error: 'Valid SKU id is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const photoBase64: string | undefined = body?.photoBase64;
    const photoUrl: string | undefined = body?.photoUrl;
    const photoType = String(body?.photoType || '').trim() || null;
    const primary = body?.role === 'primary';
    const takenByStaffId = gate.ctx.staffId;

    if (!photoBase64 && !photoUrl) {
      return NextResponse.json(
        { error: 'Either photoBase64 or photoUrl is required' },
        { status: 400 },
      );
    }

    const skuCheck = await tenantQuery(
      orgId,
      'SELECT id FROM sku_catalog WHERE id = $1 AND organization_id = $2',
      [skuId, orgId],
    );
    if (skuCheck.rows.length === 0) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    if (photoBase64) {
      const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const uploaded = await uploadPhoto({
        organizationId: orgId,
        staffId: takenByStaffId,
        entityType: 'SKU',
        entityId: skuId,
        photoType,
        fileBuffer: buffer,
        contentType: 'image/jpeg',
        poRef: String(skuId),
      });
      const cover = primary ? await makeListingCover(orgId, skuId, uploaded.id) : false;
      await announceSkuPhoto(orgId, skuId, uploaded.id);
      return NextResponse.json({
        success: true,
        photo: {
          id: uploaded.id,
          skuId,
          url: photoContentUrl(uploaded.id),
          photoType,
          takenByStaffId,
          createdAt: new Date().toISOString(),
          cover,
        },
      });
    }

    if (!photoUrl) {
      return NextResponse.json({ error: 'Could not determine photo URL' }, { status: 400 });
    }

    const attached = await attachPhotoWithLegacyUrl({
      organizationId: orgId,
      staffId: takenByStaffId,
      entityType: 'SKU',
      entityId: skuId,
      legacyUrl: photoUrl,
      photoType,
      idempotent: true,
    });

    const cover = primary ? await makeListingCover(orgId, skuId, attached.id) : false;
    if (attached.created) await announceSkuPhoto(orgId, skuId, attached.id);
    return NextResponse.json({
      success: true,
      photo: attached.created
        ? {
            id: attached.id,
            skuId,
            url: photoContentUrl(attached.id),
            photoType,
            takenByStaffId,
            createdAt: new Date().toISOString(),
            cover,
          }
        : null,
    });
  } catch (err: unknown) {
    console.error('[sku/[id]/photos POST] error:', err);
    return NextResponse.json({ error: 'Failed to save SKU photo' }, { status: 500 });
  }
}

/** Append the photo to the SKU's listing gallery and promote it to cover. */
/** Best-effort realtime reply; a publish failure never fails the save. */
async function announceSkuPhoto(orgId: OrgId, skuId: number, photoId: number): Promise<void> {
  try {
    await publishEntityMediaInsert({ organizationId: orgId, entityType: 'SKU', entityId: skuId, photoId, source: 'sku.photos' });
  } catch (err) {
    console.warn('[sku/[id]/photos POST] sku-photo.changed publish failed:', err);
  }
}

async function makeListingCover(orgId: OrgId, skuCatalogId: number, photoId: number): Promise<boolean> {
  const target = { kind: 'sku', id: skuCatalogId } as const;
  await addPhotosToListing(orgId, target, [photoId]);
  const gallery = await setListingCover(orgId, target, photoId);
  return gallery.some((item) => item.photoId === photoId && item.isCover);
}
