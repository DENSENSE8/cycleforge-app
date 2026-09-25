import { routeScan } from '@/lib/barcode-routing';

/**
 * Normalize a scan into the tote reference confirm-pick accepts, or null when
 * the scan is not a tote. A house plate arrives as bare `H-12` or as the QR
 * redirect `/m/h/12`; both canonicalize to the `H-{id}` form the API resolves
 * (numeric id and external tote barcodes are resolved server-side — the
 * bytes alone cannot classify an external code).
 *
 * Shared by both phone pickers: the order picker (`/m/pick/[orderId]`) and the
 * directed pick session (`/m/pick`).
 */
export function toteRefFromScan(rawScan: string): string | null {
  const route = routeScan(rawScan.trim());
  if (route?.type !== 'handling-unit') return null;
  const redirectId = /^\/m\/h\/(\d+)$/.exec(route.redirect ?? '');
  if (redirectId) return `H-${redirectId[1]}`;
  const value = route.value.trim();
  return value || null;
}
