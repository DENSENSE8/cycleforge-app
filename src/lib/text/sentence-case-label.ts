/** Tokens that stay upper-case inside a sentence-cased label (acronyms / codes, never words). */
const ACRONYMS: Record<string, true> = {
  FBA: true, SAL: true, QC: true, QA: true, SKU: true, PO: true, RMA: true, UPS: true, USPS: true,
  ASIN: true, FNSKU: true, ID: true, NAS: true, RTV: true, AFN: true, MFN: true, TSN: true, LPN: true,
  UPC: true, EAN: true, GTIN: true, DHL: true, API: true, CSV: true, PDF: true, URL: true,
};

/** Sentence-case a catalog / print label. */
export function sentenceCaseLabel(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return t;
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(t)) return t;
  if (/[a-z]/.test(t)) return t;
  const words = t
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS[word] ? word : word.toLowerCase()));
  const first = words[0] ?? '';
  words[0] = first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(' ');
}
