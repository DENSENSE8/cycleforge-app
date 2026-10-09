'use client';

/**
 * Upload a capture batch onto one `sku_stock` row, in shutter order, as
 * `SKU_STOCK` primary links — the write the desk record's photo upload makes.
 * The server announces each one (`sku-stock-photo.changed`), which repaints
 * the desk. Each shot's preview URL is released once it has been sent.
 */

import type { CapturedShot } from '@/lib/photos/capture-session';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';

export async function uploadSkuStockShots(stockId: number, shots: readonly CapturedShot[]): Promise<number> {
  if (shots.length === 0) return 0;
  toast.message(`Uploading ${shots.length} photo${shots.length === 1 ? '' : 's'}…`, { position: 'top-center', duration: 5000 });
  let failed = 0;
  for (const shot of shots) {
    try {
      await uploadPhotoClient({
        file: shot.blob,
        entityType: 'SKU_STOCK',
        entityId: stockId,
        linkRole: 'primary',
        clientCapturedAtMs: shot.capturedAtMs,
      });
    } catch (err) {
      failed += 1;
      console.warn('stock photo upload failed', err);
    } finally {
      URL.revokeObjectURL(shot.previewUrl);
    }
  }
  const added = shots.length - failed;
  if (failed > 0) {
    toast.error(`${failed} photo${failed === 1 ? '' : 's'} failed to upload`, { position: 'top-center' });
  }
  if (added > 0) {
    toast.success(`Added ${added} photo${added === 1 ? '' : 's'}`, { position: 'top-center' });
  }
  return added;
}

/**
 * The `sku_stock` id a bin SKU's photos hang off, created server-side when the
 * SKU has none yet (`POST /api/sku-stock/:sku/ensure`). Null on failure, with
 * a toast; the caller drops the batch.
 */
export async function ensureSkuStockId(sku: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/sku-stock/${encodeURIComponent(sku)}/ensure`, { method: 'POST' });
    const body = (await res.json().catch(() => null)) as { stockId?: number; error?: string } | null;
    if (res.ok && typeof body?.stockId === 'number') return body.stockId;
    toast.error(body?.error || 'Could not prepare this item for photos', { position: 'top-center' });
  } catch (err) {
    console.warn('sku_stock ensure failed', err);
    toast.error('Could not prepare this item for photos', { position: 'top-center' });
  }
  return null;
}
