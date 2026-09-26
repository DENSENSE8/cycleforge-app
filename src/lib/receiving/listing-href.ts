/** `normalizeListingHref` — the ONE normalizer for a stored, pasted, or note-scraped listing URL. */

/**
 * Normalize a listing href to an absolute http(s) URL, or `null` when it is not
 * one. A bare host (`www.ebay.com/itm/1`) gains `https://`; anything carrying a
 * non-http scheme is REJECTED, not repaired.
 */
export function normalizeListingHref(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  // Blindly prepending `https://` turned `ftp://example.com/itm/123456` into `https://ftp//example.com/itm/123456` — a URL that parses,…
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t);
  const isHttp = /^https?:\/\//i.test(t);
  if (hasScheme && !isHttp) return null;
  try {
    const withProto = isHttp ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}
