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

/**
 * The marketplace's full-size rendition of the same picture — for a full-screen
 * viewer, where the table-sized thumb reads as a blur. eBay `/s-l1600`, the
 * legacy `$_57` original; Amazon without a render directive. Other URLs unchanged.
 */
export function marketplaceFullUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host === 'i.ebayimg.com' || host.endsWith('.ebayimg.com')) {
      url.pathname = url.pathname.replace(/\/s-l\d+(?=\.[a-z0-9]+$)/i, '/s-l1600');
      url.pathname = url.pathname.replace(/\/\$_\d+(?=\.[a-z0-9]+$)/i, '/$_57');
      return url.toString();
    }

    if (host === 'm.media-amazon.com' || host.endsWith('images-amazon.com')) {
      url.pathname = url.pathname.replace(/\._[^/]+_(\.[a-z0-9]+)$/i, '$1');
      return url.toString();
    }
  } catch {
    // Relative internal routes and malformed legacy values stay untouched.
  }

  return raw;
}

/** Original-size stand-in: a marketplace URL with no render directive is the uploaded original. */
const ORIGINAL_EDGE = 10_000;

/**
 * Long edge (px) of eBay's numbered legacy renditions: `$_57` is the listing
 * original, `$_12` the standard full image (eBay KB 2194), `$_1` the gallery
 * image, `$_6` the small gallery image. Unknown codes rank 0 (size unknown).
 */
const EBAY_LEGACY_EDGE: Readonly<Record<string, number>> = { '57': 1600, '12': 500, '1': 400, '6': 225 };

const EBAY_SIZED = /\/s-l(\d+)(\.[a-z0-9]+)$/i;
const EBAY_LEGACY = /\/\$_(\d+)(\.[a-z0-9]+)$/i;
const AMAZON_DIRECTIVE = /\._([^/]+)_(\.[a-z0-9]+)$/i;
const EXTENSION = /\.[a-z0-9]+$/i;

function marketplaceCdn(value: string | null | undefined): { cdn: 'ebay' | 'amazon'; path: string } | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === 'i.ebayimg.com' || host.endsWith('.ebayimg.com')) return { cdn: 'ebay', path: url.pathname };
    if (host === 'm.media-amazon.com' || host.endsWith('images-amazon.com')) return { cdn: 'amazon', path: url.pathname };
  } catch {
    // Relative internal routes and malformed legacy values are not marketplace renditions.
  }
  return null;
}

/**
 * The same picture across every marketplace rendition: eBay without its
 * `/s-lNNN` or legacy `$_NN` segment, Amazon without its `._…_` render
 * directive; host, query and file extension dropped. `null` for anything that
 * is not an eBay/Amazon CDN URL — those only ever match by exact URL.
 */
export function marketplaceImageKey(value: string | null | undefined): string | null {
  const parsed = marketplaceCdn(value);
  if (!parsed) return null;
  const path =
    parsed.cdn === 'ebay'
      ? parsed.path.replace(EBAY_SIZED, '').replace(EBAY_LEGACY, '').replace(EXTENSION, '')
      : parsed.path.replace(AMAZON_DIRECTIVE, '').replace(EXTENSION, '');
  return `${parsed.cdn}:${path}`;
}

/**
 * Long edge (px) a marketplace rendition URL asks for — higher is the better
 * copy of the same picture ({@link marketplaceImageKey}). An Amazon URL with no
 * size directive is the original; 0 means unknown (unknown eBay code, or not a
 * marketplace URL).
 */
export function marketplaceRenditionEdge(value: string | null | undefined): number {
  const parsed = marketplaceCdn(value);
  if (!parsed) return 0;
  if (parsed.cdn === 'ebay') {
    const sized = EBAY_SIZED.exec(parsed.path);
    if (sized) return Number(sized[1]);
    const legacy = EBAY_LEGACY.exec(parsed.path);
    return legacy ? (EBAY_LEGACY_EDGE[String(Number(legacy[1]))] ?? 0) : 0;
  }
  const directive = AMAZON_DIRECTIVE.exec(parsed.path);
  if (!directive) return ORIGINAL_EDGE;
  const sizes = [...directive[1].matchAll(/(?:SL|SX|SY|UL|UX|UY|SS|SR)(\d+)/gi)].map((m) => Number(m[1]));
  return sizes.length > 0 ? Math.max(...sizes) : ORIGINAL_EDGE;
}
