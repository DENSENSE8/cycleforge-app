/**
 * `normalizeListingHref` — the ONE normalizer for a stored, pasted, or
 * note-scraped listing URL.
 *
 * It lives in its own leaf module (no imports) so every producer can reach it
 * without a cycle: `listing-links.ts` imports `zoho-po-prefill.ts` for the
 * sync-notes tier, so the shared function cannot live in either of them.
 * Re-exported from `listing-links.ts` — that is the public import path and the
 * one most call sites use.
 *
 * Four copies of this existed until 2026-08-10 (`listingUrlForOpen`,
 * `listingHref`, `zoho-po-prefill`'s `normalizeHref`, and this one). Three
 * predated the non-http-scheme fix below and "repaired" a bad scheme into a
 * parseable URL with a nonsense host. Guard: `listing-href-sot.guard.test.ts`.
 */

/**
 * Normalize a listing href to an absolute http(s) URL, or `null` when it is not
 * one. A bare host (`www.ebay.com/itm/1`) gains `https://`; anything carrying a
 * non-http scheme is REJECTED, not repaired.
 */
export function normalizeListingHref(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  // Blindly prepending `https://` turned `ftp://example.com/itm/123456` into
  // `https://ftp//example.com/itm/123456` — a URL that parses, passes the
  // protocol check below, and renders an "Open listing" that leads nowhere.
  // The negative lookahead keeps a bare host:port (`example.com:8080/…`) out of
  // the scheme branch, since `:8080` is a port and not a scheme.
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
