/**
 * Pure display helpers for outbound documents (labels / packing slips).
 *
 * Deliberately dependency-free: the shape lives in the light `./types` module,
 * never `outbound-documents.ts` (which imports the tenant DB layer). A client
 * component needing only this predicate must not pull a server-only graph into
 * its bundle — the bundle-altitude rule in.
 */

import type { OutboundDocument } from './types';

/**
 * `application/pdf` (or an unknown mime with a `.pdf`-named URL) → render in an
 * `<embed>`; anything else is a raster image. Lifted verbatim from
 * `LabelsOrderWorkspace`, which was its only consumer until bulk printing from
 * the dashboard selection bar needed the same call.
 */
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
