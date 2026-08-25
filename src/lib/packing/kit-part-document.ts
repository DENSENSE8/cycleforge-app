/**
 * Kit-part reference document — the one place a raw `sku_kit_parts` row becomes
 * something the bench can render.
 *
 * A part MAY carry the paper that physically goes in the box (a warranty card,
 * a quick-start guide, a compliance insert) —
 * `2026-08-01d_kit_part_reference_document.sql`. Three nullable columns is a
 * shape every call site would otherwise re-interpret slightly differently, and
 * the two failure modes are silent:
 *
 *   - a whitespace-only `document_url` renders an EMPTY viewer, not an error —
 *     the operator sees a named insert that will not open, and reasonably
 *     concludes the app is broken rather than that the data is;
 *   - an unrecognized `document_mime` reaching `DocumentPreviewFrame` picks
 *     neither the pdf iframe nor the img, which fails the same way.
 *
 * So absence is decided ONCE, here: no url ⇒ no document ⇒ the row renders
 * exactly as it did before this feature existed. Pure + DB-free.
 */

import type { DocumentPreviewMimeHint } from '@/lib/documents/document-preview-mime';

/** What the bench needs to show and open one insert. */
export interface KitPartDocument {
  /**
   * Directly fetchable (Blob) url. NEVER an `/api/documents/:id/content` path:
   * `packing.*` does not imply `orders.view`, so that proxy 403s the packer
   * this surface exists for. Enforced at the column's docblock + this type's
   * only producer.
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
