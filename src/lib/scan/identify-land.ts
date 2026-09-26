/** How `/m/scan` consumes one {@link dispatchScan} result. */

import { scannedUnitKey, type ScanRoute } from '@/lib/barcode-routing';
import { fnskuHubHref } from '@/lib/mobile/fnsku-hub-href';
import type { ScanDispatch } from '@/lib/scan/dispatch-table';

/** The kernel armed for QC — where the runner's "Next unit" returns. */
export const QC_SCAN_HREF = '/m/scan?work=qc';

export type ScanIdentifyLand =
  | { kind: 'intake' }
  | { kind: 'identify'; href: string }
  | { kind: 'settle' };

function isLocationScan(route: ScanRoute | null): boolean {
  return route?.type === 'bin' || route?.type === 'bin-paired-order';
}

export function landScanIdentify(
  dispatch: ScanDispatch,
  route: ScanRoute | null,
): ScanIdentifyLand {
  if (dispatch.card === 'arrival') return { kind: 'intake' };
  if (isLocationScan(route)) return { kind: 'settle' };
  if (route?.type === 'fnsku') return { kind: 'identify', href: fnskuHubHref(route.value) };
  if (route?.type === 'serial-unit') {
    const key = scannedUnitKey(route.value);
    if (key) {
      const hub = `/m/u/${encodeURIComponent(key)}`;
      return { kind: 'identify', href: dispatch.card === 'qc' ? `${hub}/qc` : hub };
    }
  }
  if (dispatch.card === 'qc' && route?.type === 'receiving-line') {
    const line = /^\/m\/l\/(\d+)$/.exec(route.redirect || '');
    if (line) return { kind: 'identify', href: `/m/qc/line/${line[1]}` };
  }
  if (dispatch.card === 'qc' && route?.type === 'receiving') {
    const carton = /^\/m\/r\/(\d+)$/.exec(route.redirect || '');
    if (carton) return { kind: 'identify', href: `/m/r/${carton[1]}/qc` };
  }
  if (route?.redirect) return { kind: 'identify', href: route.redirect };
  return { kind: 'settle' };
}
