/** Pure display helpers for outbound documents (labels / packing slips). */

import type { OutboundDocument } from './types';

/** `application/pdf` (or an unknown mime with a `.pdf`-named URL) → render in an `<embed>`; anything else is a raster image. */
export function isPdfOutboundDocument(doc: OutboundDocument): boolean {
  const mime = doc.data.mimeType?.toLowerCase() ?? '';
  if (mime) return mime.includes('pdf');
  return /\.pdf(\?|$)/i.test(doc.data.url);
}

/**
 * The streamable content URL for a document — what `DocumentPreviewFrame` and
 * the "open in a new tab" affordances point at. Always the API route, never the
 * raw NAS URL: the route is what carries auth and the right content-type.
 */
export function outboundDocumentContentSrc(doc: OutboundDocument | undefined | null): string | null {
  return doc ? `/api/documents/${doc.id}/content` : null;
}

/**
 * The `DocumentSlideOver` mime hint for a document, defaulting to `pdf` when
 * the type has nothing attached yet (the switcher still lists empty types).
 */
export function outboundDocumentMimeHint(doc: OutboundDocument | undefined | null): 'pdf' | 'image' {
  if (!doc) return 'pdf';
  return isPdfOutboundDocument(doc) ? 'pdf' : 'image';
}
