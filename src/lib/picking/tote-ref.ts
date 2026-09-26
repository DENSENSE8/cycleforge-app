import { routeScan } from '@/lib/barcode-routing';

/** Normalize a scan into the tote reference confirm-pick accepts, or null when the scan is not a tote. */
export function toteRefFromScan(rawScan: string): string | null {
  const route = routeScan(rawScan.trim());
  if (route?.type !== 'handling-unit') return null;
  const redirectId = /^\/m\/h\/(\d+)$/.exec(route.redirect ?? '');
  if (redirectId) return `H-${redirectId[1]}`;
  const value = route.value.trim();
  return value || null;
}
