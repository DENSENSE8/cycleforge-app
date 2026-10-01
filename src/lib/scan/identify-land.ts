/** How `/m/scan` consumes one {@link dispatchScan} result. */

import { scannedUnitKey, type ScanRoute } from '@/lib/barcode-routing';
import { fnskuHubHref } from '@/lib/mobile/fnsku-hub-href';
import { qcWorkHref } from '@/lib/qc/qc-work-href';
import type { ScanDispatch } from '@/lib/scan/dispatch-table';

/** The kernel armed for QC — where the runner's "Next unit" returns. */
export const QC_SCAN_HREF = '/m/scan?work=qc';

type ScanIdentifyLand =
  | { kind: 'intake' }
  | { kind: 'identify'; href: string }
  | { kind: 'settle' };

function isLocationScan(route: ScanRoute | null): boolean {
  return route?.type === 'bin' || route?.type === 'bin-paired-order';
}

/**
 * View mode names the record; it never inherits the next operational step
 * encoded by a printed label. Receiving labels may point at `/qc`, but support
 * staff still land on the carton record to inspect its contents and evidence.
 */
export function viewOnlyIdentityHref(route: ScanRoute | null): string | null {
  if (route?.type !== 'receiving') return null;
  const receivingId = /^\/m\/r\/(\d+)/.exec(route.redirect || '')?.[1];
  return receivingId ? `/m/r/${receivingId}` : null;
}

export function landScanIdentify(
  dispatch: ScanDispatch,
  route: ScanRoute | null,
): ScanIdentifyLand {
  if (dispatch.card === 'arrival') return { kind: 'intake' };
  if (isLocationScan(route)) return { kind: 'settle' };
  if (route?.type === 'fnsku') return { kind: 'identify', href: fnskuHubHref(route.value) };
  if (dispatch.card === 'qc' && route) {
    const href = qcWorkHref(route);
    if (href) return { kind: 'identify', href };
  }
  if (route?.type === 'serial-unit') {
    const key = scannedUnitKey(route.value);
    if (key) {
      const hub = `/m/u/${encodeURIComponent(key)}`;
      return { kind: 'identify', href: hub };
    }
  }
  if (route?.redirect) return { kind: 'identify', href: route.redirect };
  return { kind: 'settle' };
}
