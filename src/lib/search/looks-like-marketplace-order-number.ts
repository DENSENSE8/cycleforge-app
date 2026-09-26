/** Shape of a marketplace order # (eBay 2-5-5 `11-15067-72584`, Amazon 3-7-7 `111-1234567-1234567`, or a 10+ digit compact paste). */

export function looksLikeMarketplaceOrderNumber(raw: string): boolean {
  const q = String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-');
  if (!q) return false;
  if (/^\d{2}-\d{5}-\d{5}$/.test(q)) return true;
  if (/^\d{3}-\d{7}-\d{7}$/.test(q)) return true;
  const compact = q.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^\d{10,}$/.test(compact);
}
