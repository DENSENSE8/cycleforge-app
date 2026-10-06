import 'server-only';

import { put } from '@vercel/blob';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  deleteManualBlob,
  ManualFileError,
  safeManualFileSlug,
  storeManualFile,
} from '@/lib/manuals/manual-file-store';
import {
  updateProductManual,
  upsertProductManual,
  type ProductManual,
} from '@/lib/neon/product-manuals-queries';
import { tenantQuery } from '@/lib/tenancy/db';

/** One library upload: a new manual, or a replacement file for manual `replaceId`. */
export interface ProductManualUploadInput {
  file: File;
  /** Optional page-1 thumbnail the client rendered, stored beside the file. */
  thumbnail?: File | null;
  replaceId?: number | null;
  folderPath?: string | null;
  displayName?: string | null;
  type?: string | null;
  sku?: string | null;
  itemNumber?: string | null;
  status?: 'unassigned' | 'assigned' | 'archived';
}

/**
 * The library upload (`/api/product-manuals/upload`, prepack's manual upload):
 * store the file (Word → PDF), write the `product_manuals` row, then drop the
 * replaced blob. Every read and write is org-scoped and GUC-wrapped (the row
 * writers wrap themselves in `withTenantTransaction` when given the org).
 * Throws ManualFileError for caller errors (404 on an unknown `replaceId`).
 */
export async function uploadProductManual(
  orgId: OrgId,
  input: ProductManualUploadInput,
): Promise<{ manual: ProductManual; blobUrl: string }> {
  const { file } = input;
  const replaceId = input.replaceId ?? null;
  const displayName = input.displayName?.trim() || file.name.replace(/\.[a-z0-9]+$/i, '');
  const folderPath = input.folderPath?.trim() || null;
  const type = input.type?.trim() || null;
  const sku = input.sku?.trim() || null;
  const itemNumber = input.itemNumber?.trim() || null;

  // Replace flow: load the existing row first so we can clean up its blob.
  // Org-ownership gate — a caller can't swap the blob on another org's manual.
  let previousSourceUrl: string | null = null;
  if (replaceId) {
    const existing = await tenantQuery<{ source_url: string | null }>(
      orgId,
      `SELECT source_url FROM product_manuals WHERE id = $1 AND organization_id = $2`,
      [replaceId, orgId],
    );
    if (!existing.rows[0]) throw new ManualFileError('manual not found', 404);
    previousSourceUrl = existing.rows[0].source_url || null;
  }

  // Validates size, converts Word → PDF, uploads.
  const stored = await storeManualFile(file);

  // The thumbnail is decorative — never fail the whole upload over it.
  let thumbnailUrl: string | null = null;
  if (input.thumbnail && input.thumbnail.size > 0) {
    try {
      const thumbBuffer = Buffer.from(await input.thumbnail.arrayBuffer());
      const thumbKey = `product-manuals/thumbs/${Date.now()}_${safeManualFileSlug(file.name) || 'manual'}.jpg`;
      const thumbUploaded = await put(thumbKey, thumbBuffer, {
        access: 'public',
        contentType: input.thumbnail.type || 'image/jpeg',
      });
      thumbnailUrl = thumbUploaded.url;
    } catch (err) {
      console.warn('[product-manuals/upload] thumbnail save failed:', err);
    }
  }

  // upsertProductManual hardcodes sku = NULL on insert; a supplied SKU is
  // written after the row exists.
  let manual = replaceId
    ? await updateProductManual({
        id: replaceId,
        sourceUrl: stored.url,
        displayName,
        ...(folderPath != null ? { folderPath } : {}),
        ...(type ? { type } : {}),
        ...(sku ? { sku } : {}),
        ...(itemNumber ? { itemNumber } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      }, orgId)
    : await upsertProductManual({
        sourceUrl: stored.url,
        displayName,
        folderPath,
        type,
        itemNumber,
        status: input.status ?? 'unassigned',
        thumbnailUrl,
        // The stored file's name (the .pdf for converted Word docs) so search matches it.
        fileName: stored.fileName,
      }, orgId);

  if (!replaceId && sku) {
    manual = await updateProductManual({ id: manual.id, sku }, orgId);
  }

  // Best-effort delete of the old blob — the row already points at the new URL.
  if (previousSourceUrl && previousSourceUrl !== stored.url) {
    await deleteManualBlob(previousSourceUrl);
  }

  return { manual, blobUrl: stored.url };
}
