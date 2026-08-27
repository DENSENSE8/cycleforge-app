export type DocumentPreviewMimeHint = 'pdf' | 'image' | 'unknown';

/** Resolve how DocumentPreviewFrame should render a document URL. */
export function resolveDocumentPreviewMime(
  src: string | null | undefined,
  hint?: DocumentPreviewMimeHint,
): DocumentPreviewMimeHint {
  if (hint && hint !== 'unknown') return hint;
  if (!src) return 'unknown';
  if (/\.pdf(\?|#|$)/i.test(src) || src.includes('application/pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(src)) return 'image';
  // Same-origin document content routes are almost always PDFs for outbound docs.
  if (/\/api\/documents\/\d+\/content/i.test(src)) return 'pdf';
  return 'unknown';
}
