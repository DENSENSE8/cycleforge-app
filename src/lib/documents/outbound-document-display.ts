/**
 * Pure display helpers for outbound documents (labels / packing slips).
 *
 * Deliberately dependency-free: the shape lives in the light `./types` module,
 * never `outbound-documents.ts` (which imports the tenant DB layer). A client
 * component needing only this predicate must not pull a server-only graph into
 * its bundle — the bundle-altitude rule in `.claude/rules/build-gotchas.md`.
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
