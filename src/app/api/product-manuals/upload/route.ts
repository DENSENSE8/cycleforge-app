import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { withAuth } from '@/lib/auth/withAuth';
import {
  deleteManualBlob,
  ManualFileError,
  safeManualFileSlug,
  storeManualFile,
} from '@/lib/manuals/manual-file-store';
import {
  upsertProductManual,
  updateProductManual,
  getProductManualById,
} from '@/lib/neon/product-manuals-queries';

// LibreOffice conversion runs in a Vercel Sandbox and can take several
// seconds (longer on a cold sandbox), so we need Node + a generous ceiling.
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/product-manuals/upload
 *
 * Multipart upload for PDFs (and other previewable formats). Two modes:
 *   - create   — no `id` in the form → new row, blob saved at
 *                `product-manuals/<timestamp>_<slug>.pdf`, row goes in as
 *                `status='unassigned'` unless caller passes one.
 *   - replace  — `id` present → swaps the blob on the existing row and
 *                `del()`s the previous source_url (best-effort; non-fatal
 *                if the old blob is already gone).
 *
 * Why a dedicated multipart route instead of reusing the CRUD POST: that
 * endpoint takes JSON and assumes the file already lives somewhere with a
 * public URL. This route owns the Blob lifecycle so the UI can hand a File
 * straight from `<input type="file">`.
 *
 * Word docs (.doc/.docx) are auto-converted to PDF via headless LibreOffice
 * (see lib/manuals/docxToPdf) before upload — the stored blob is always the
 * PDF; the source Word file is not retained. Applies to both create and
 * replace, so "Replace file" on a PDF manual accepts a Word doc too.
 *
 * Form fields:
 *   file          required — PDF, image, or Word doc (.doc/.docx → converted)
 *   id            optional — when present, replaces the existing manual's blob
 *   displayName   optional — defaults to the file's name (stripped of .pdf)
 *   folderPath    optional — '/'-separated; pre-filled to current breadcrumb
 *   type          optional — manual | troubleshooting | installation | …
 *   sku           optional
 *   itemNumber    optional
 *   status        optional — defaults to 'unassigned'
 */
export const POST = withAuth(
  async (request, ctx) => {
    // Thread orgId so the by-id replace read (ownership gate), upsert/update
    // writes all GUC-wrap and scope to this org once RLS is enforced
    // (NEEDS-COL — product_manuals has no organization_id column yet).
    const orgId = ctx.organizationId ?? undefined;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ success: false, error: 'multipart body required' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
    }
    // Optional companion thumbnail — generated client-side from page 1 of
    // the PDF so the sidebar can render visual cards. Best-effort: if the
    // upload comes without one (replace from a non-PDF, generator failure,
    // backfill not yet performed), we just leave thumbnail_url null.
    const thumbnailFile = form.get('thumbnail');
    const idRaw = form.get('id');
    const id = idRaw != null && idRaw !== '' ? Number(idRaw) : null;
    if (idRaw != null && idRaw !== '' && (!Number.isFinite(id) || id! <= 0)) {
      return NextResponse.json({ success: false, error: 'invalid id' }, { status: 400 });
    }

    const folderPath = String(form.get('folderPath') || '').trim() || null;
    const displayName =
      String(form.get('displayName') || '').trim()
      || file.name.replace(/\.[a-z0-9]+$/i, '');
    const type = String(form.get('type') || '').trim() || null;
    const sku = String(form.get('sku') || '').trim() || null;
    const itemNumber = String(form.get('itemNumber') || '').trim() || null;
    const statusRaw = String(form.get('status') || '').trim();
    const status =
      statusRaw === 'assigned' || statusRaw === 'archived' ? statusRaw : 'unassigned';

    const safeName = safeManualFileSlug(file.name);

    try {
      // Replace flow: load the existing row first so we can clean up its blob.
      let previousSourceUrl: string | null = null;
      if (id) {
        // Org-ownership gate on the replace flow — GUC-wrapped by-id read so a
        // caller can't swap the blob on another org's manual (404 not 403).
        const existing = await getProductManualById(id, orgId);
        if (!existing) {
          return NextResponse.json({ success: false, error: 'manual not found' }, { status: 404 });
        }
        previousSourceUrl = existing.source_url || null;
      }

      // Validates size, converts Word → PDF, uploads (lib/manuals/manual-file-store).
      const stored = await storeManualFile(file);

      // Upload the companion thumbnail (if provided) under a sibling key
      // so del() lifetimes track the parent — we don't actively clean these
      // up on rename, but Vercel Blob garbage-collects orphans eventually.
      let thumbnailUrl: string | null = null;
      if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
        try {
          const thumbBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
          const thumbKey = `product-manuals/thumbs/${Date.now()}_${safeName || 'manual'}.jpg`;
          const thumbUploaded = await put(thumbKey, thumbBuffer, {
            access: 'public',
            contentType: thumbnailFile.type || 'image/jpeg',
          });
          thumbnailUrl = thumbUploaded.url;
        } catch (err) {
          // Thumbnail is decorative — never fail the whole upload over it.
          console.warn('[product-manuals/upload] thumbnail save failed:', err);
        }
      }

      // upsertProductManual hardcodes sku = NULL on insert (the column is
      // populated separately via updateProductManual). For the create flow,
      // if the operator supplied a SKU we PATCH it in after the row exists.
      let row = id
        ? await updateProductManual({
            id,
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
            status,
            thumbnailUrl,
            // Use the stored file's name so the search matcher can match
            // against it — for converted Word docs that's the .pdf, not the
            // transient .docx the operator dropped in.
            fileName: stored.fileName,
          }, orgId);

      if (!id && sku) {
        row = await updateProductManual({ id: row.id, sku }, orgId);
      }

      // Best-effort delete of the old blob — the DB row already points at the
      // new URL and a stale blob is harmless.
      if (previousSourceUrl && previousSourceUrl !== stored.url) {
        await deleteManualBlob(previousSourceUrl);
      }

      return NextResponse.json({ success: true, manual: row, blobUrl: stored.url });
    } catch (err: unknown) {
      if (err instanceof ManualFileError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status });
      }
      const message = err instanceof Error ? err.message : 'upload failed';
      console.error('[product-manuals/upload] error:', err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'product_manuals.manage' },
);
