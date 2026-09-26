import 'server-only';

import { put, del } from '@vercel/blob';
import { docxToPdf } from '@/lib/manuals/docxToPdf';
import { isVercelBlobUrl } from '@/lib/blob/vercel-blob-url';

/** Blob lifecycle for product-manual files, shared by the library upload route (`/api/product-manuals/upload`) and the order paperwork… */

/** 50MB ceiling — operators dropping huge scans into the library is almost always a mistake. */
const MANUAL_FILE_MAX_BYTES = 50 * 1024 * 1024;

export class ManualFileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ManualFileError';
  }
}

interface StoredManualFile {
  /** Public Vercel Blob URL (stored as product_manuals.source_url). */
  url: string;
  /** Name of the stored file — the .pdf for converted Word docs. */
  fileName: string;
  contentType: string;
}

/** Path-safe blob slug: strips traversal, collapses spaces, drops exotic chars. */
export function safeManualFileSlug(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

function isWordDoc(file: File): boolean {
  return (
    /\.docx?$/i.test(file.name)
    || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || file.type === 'application/msword'
  );
}

/**
 * Validate (400 empty, 413 over 50MB), convert Word → PDF when needed, and
 * upload to Vercel Blob under `product-manuals/<timestamp>_<slug>`. Throws
 * ManualFileError for caller errors and conversion failures (502).
 */
export async function storeManualFile(file: File): Promise<StoredManualFile> {
  if (file.size === 0) throw new ManualFileError('file is empty', 400);
  if (file.size > MANUAL_FILE_MAX_BYTES) throw new ManualFileError('file exceeds 50MB', 413);

  const safeName = safeManualFileSlug(file.name);
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let outName = safeName || 'manual.pdf';
  let contentType = file.type || 'application/pdf';
  let fileName = file.name;

  if (isWordDoc(file)) {
    try {
      buffer = await docxToPdf(buffer);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'conversion failed';
      console.error('[manual-file-store] docx→pdf conversion failed:', err);
      throw new ManualFileError(`Word→PDF conversion failed: ${detail}`, 502);
    }
    outName = (safeName || 'manual').replace(/\.docx?$/i, '') + '.pdf';
    contentType = 'application/pdf';
    fileName = file.name.replace(/\.docx?$/i, '') + '.pdf';
  }

  const uploaded = await put(`product-manuals/${Date.now()}_${outName}`, buffer, {
    access: 'public',
    contentType,
  });
  return { url: uploaded.url, fileName, contentType };
}

/** Best-effort blob delete — a stale blob is harmless, so never throw. */
export async function deleteManualBlob(url: string | null | undefined): Promise<void> {
  if (!url || !isVercelBlobUrl(url)) return;
  try {
    await del(url);
  } catch {
    /* ignore */
  }
}
