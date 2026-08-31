/**
 * Sentence-case a catalog / print label.
 *
 * Mixed-case brands stay as authored (`eBay`, `Purchase order`). ALL-CAPS
 * words become sentence case (`RETURN` → `Return`). Hyphenated codes
 * (`ECWID-RS`) stay codes so the 2×1" face does not rewrite a SKU-like slug.
 */
export function sentenceCaseLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return t;
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(t)) return t;
  if (/[a-z]/.test(t)) return t;
  const spaced = t.replace(/_+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
