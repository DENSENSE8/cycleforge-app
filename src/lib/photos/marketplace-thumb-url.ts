/**
 * Ask marketplace CDNs for a table-sized asset instead of downloading their
 * multi-megabyte listing original into a 48–112px face. The stored URL remains
 * the canonical original; this is a presentation-only transform.
 */
export function marketplaceThumbUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host === 'i.ebayimg.com' || host.endsWith('.ebayimg.com')) {
      // Current eBay image paths expose an explicit long-edge size.
      url.pathname = url.pathname.replace(/\/s-l\d+(?=\.[a-z0-9]+$)/i, '/s-l225');
      // Legacy /00/ paths use numbered renditions: $_6 is the small gallery
      // image while $_57 is the listing original (often several megabytes).
      url.pathname = url.pathname.replace(/\/\$_\d+(?=\.[a-z0-9]+$)/i, '/$_6');
      return url.toString();
    }

    if (host === 'm.media-amazon.com' || host.endsWith('images-amazon.com')) {
      // Replace an existing Amazon render directive, or add one before the
      // extension. SL200 comfortably covers the largest 112px record face at
      // common device pixel ratios without fetching the source original.
      url.pathname = url.pathname.replace(/(?:\._[^/]+_)?(\.[a-z0-9]+)$/i, '._SL200_$1');
      return url.toString();
    }
  } catch {
    // Relative internal routes and malformed legacy values stay untouched.
  }

  return raw;
}
