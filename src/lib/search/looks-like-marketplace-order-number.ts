/**
 * Shape of a marketplace order # (eBay `11-15067-72584`, Amazon `111-…-…`,
 * or a 10+ digit compact id). Leaf module — imported by header axis routing
 * without going through {@link order-number-match} (Turbopack live-binding).
 */

export function looksLikeMarketplaceOrderNumber(raw: string): boolean {
  const q = String(raw ?? '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-');
  if (!q) return false;
  if (/^\d{2}-\d{4,}-\d{4,}$/.test(q)) return true;
  if (/^\d{3}-\d{7}-\d{7}$/.test(q)) return true;
  const compact = q.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^\d{10,}$/.test(compact);
}
