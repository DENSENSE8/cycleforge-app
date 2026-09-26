/** Vercel Blob URL recognition — shared by upload/rename paths and the same-origin preview proxies. */

export function isVercelBlobHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'blob.vercel-storage.com' || h.endsWith('.blob.vercel-storage.com');
}

export function isVercelBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return isVercelBlobHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Same-origin PDF/image preview for a product-manuals row. */
export function productManualContentPath(id: number): string {
  return `/api/product-manuals/${id}/content`;
}

/**
 * Same-origin preview for a kit-part insert. Session-gated (not
 * `orders.view`) so packers can iframe it — the documents content proxy 403s
 * them.
 */
export function kitPartDocumentContentPath(id: number): string {
  return `/api/sku-kit-parts/${id}/document`;
}
