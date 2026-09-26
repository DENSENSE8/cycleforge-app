/** Kit-part reference document — the one place a raw `sku_kit_parts` row becomes something the bench can render. */

import type { DocumentPreviewMimeHint } from '@/design-system/components/document-preview-mime';

export { kitPartDocumentContentPath } from '@/lib/blob/vercel-blob-url';

/** What the bench needs to show and open one insert. */
export interface KitPartDocument {
  /**
   * Stored Blob (or other http) url — the durable pointer on the row.
   * Preview iframes must NOT use this directly: Vercel Blob CSP blanks PDFs
   * on our origin. Use {@link kitPartDocumentContentPath} at the view.
   */
  url: string;
  /** Operator-facing name — the part's own name when the column is null. */
  title: string;
  /** Omitted when unrecognized, so the client sniffs the url instead. */
  mime?: DocumentPreviewMimeHint;
}

/** The `sku_kit_parts` fields this resolver reads. Structural on purpose — it
 *  takes the DB row and the mapped DTO equally. */
interface KitPartDocumentSource {
  component_name?: string | null;
  name?: string | null;
  document_url?: string | null;
  document_title?: string | null;
  document_mime?: string | null;
}

const MIME_HINTS: ReadonlySet<string> = new Set<DocumentPreviewMimeHint>([
  'pdf',
  'image',
  'unknown',
]);

export function kitPartDocument(part: KitPartDocumentSource): KitPartDocument | null {
  const url = part.document_url?.trim();
  // No url ⇒ no document. A title/mime without one is already rejected by
  // sku_kit_parts_document_url_required_chk; this is the client-side twin so a
  // pre-constraint row cannot paint a dead affordance either.
  if (!url) return null;

  const title =
    part.document_title?.trim() ||
    part.component_name?.trim() ||
    part.name?.trim() ||
    'Insert';

  const rawMime = part.document_mime?.trim().toLowerCase();
  // 'unknown' is a legal stored value but carries no information — drop it so
  // resolveDocumentPreviewMime() sniffs the url, which is strictly better.
  const mime =
    rawMime && rawMime !== 'unknown' && MIME_HINTS.has(rawMime)
      ? (rawMime as DocumentPreviewMimeHint)
      : undefined;

  return mime ? { url, title, mime } : { url, title };
}
