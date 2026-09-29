import 'server-only';

import { isVercelBlobUrl } from '@/lib/blob/vercel-blob-url';
import {
  documentOcrFailure,
  DocumentOcrError,
  readDocumentWithLocalOcr,
} from '@/lib/document-intake/document-ocr';
import { getProductManualById } from '@/lib/neon/product-manuals-queries';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AssistantAttachment, AssistantPageContext } from './context-store';

const FETCH_MAX_BYTES = 50 * 1024 * 1024;

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
async function readAttachment(orgId: OrgId, attachment: AssistantAttachment): Promise<AssistantAttachment> {
  try {
    const manual = await getProductManualById(attachment.id, orgId);
    if (!manual?.is_active) throw new DocumentOcrError('unsupported_source', 'The attached file no longer exists.');
    const sourceUrl = String(manual.source_url ?? '').trim();
    // Composer uploads land in Vercel Blob. Refusing arbitrary manual URLs
    // keeps this server-side OCR adapter from becoming an SSRF fetcher.
    if (!isVercelBlobUrl(sourceUrl)) {
      throw new DocumentOcrError('unsupported_source', 'Only files uploaded to CycleForge can be read by document OCR.');
    }
    const response = await fetch(sourceUrl, { cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new DocumentOcrError('unreadable', `The attached file could not be loaded (${response.status}).`);
    const announced = Number(response.headers.get('content-length') ?? 0);
    if (announced > FETCH_MAX_BYTES) throw new DocumentOcrError('too_large', 'The attached file exceeds 50 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > FETCH_MAX_BYTES) throw new DocumentOcrError('too_large', 'The attached file exceeds 50 MB.');
    const fileName = manual.file_name?.trim() || attachment.name;
    const headerMime = String(response.headers.get('content-type') ?? '').split(';')[0].trim();
    const mimeType = headerMime && headerMime !== 'application/octet-stream'
      ? headerMime
      : mimeFromName(fileName) || attachment.mime;
    const ocr = await readDocumentWithLocalOcr(orgId, [{ bytes, fileName, mimeType }]);
    return { ...attachment, ocr };
  } catch (error) {
    return { ...attachment, ocr: documentOcrFailure(error) };
  }
}

/**
 * Chat adapter for the shared OCR service. It enriches per-turn context only;
 * it cannot create Receiving, Sales, or any other operational record.
 */
export async function withAttachmentOcr(
  orgId: OrgId,
  context: AssistantPageContext | null | undefined,
): Promise<AssistantPageContext | null> {
  if (!context) return null;
  const attachments = context.attachments ?? [];
  if (attachments.length === 0) return context;
  // Keep pressure on the single local GPU predictable and preserve attachment order.
  const enriched: AssistantAttachment[] = [];
  for (const attachment of attachments) enriched.push(await readAttachment(orgId, attachment));
  return { ...context, attachments: enriched };
}
