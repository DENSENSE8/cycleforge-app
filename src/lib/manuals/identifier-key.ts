/**
 * The paperwork identifier key — item numbers and SKUs compared as UPPER
 * alphanumerics with leading zeros stripped (`#001234` → `1234`). Pure: safe
 * in client bundles (paperwork pairing scopes run in the Orders pane).
 */
export function normalizeIdentifier(rawValue: string): string {
  const cleaned = String(rawValue || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.replace(/^0+/, '') || '';
}
