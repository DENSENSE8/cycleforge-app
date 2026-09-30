'use client';

/**
 * Add a product photo from a record's item tile (owner 2026-09-29): the file
 * is compressed like every other capture, stored on the catalog SKU (entity
 * `SKU`, `sku_catalog.id`) and promoted to the SKU listing cover in the same
 * request (`POST /api/sku/[id]/photos`, `role: 'primary'`) — the tier
 * `productImageUrl` paints after the catalog photo, before Zoho.
 */

import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';

export interface SkuProductPhoto {
  id: number;
  url: string;
}

export async function uploadSkuProductPhoto(skuCatalogId: number, file: Blob): Promise<SkuProductPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image');
  const { base64 } = await compressPhotoForUpload(file, { source: 'record-item-product' });
  const res = await fetch(`/api/sku/${skuCatalogId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoBase64: base64, photoType: 'product', role: 'primary' }),
  });
  const body = (await res.json().catch(() => null)) as { photo?: { id: number; url: string; cover?: boolean }; error?: string } | null;
  if (!res.ok || !body?.photo) throw new Error(body?.error || 'Could not save the product photo');
  if (!body.photo.cover) throw new Error('Saved, but it could not become the product photo');
  return { id: body.photo.id, url: body.photo.url };
}
