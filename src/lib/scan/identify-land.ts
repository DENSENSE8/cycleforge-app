/**
 * How `/m/scan` consumes one {@link dispatchScan} result.
 *
 * The table names a Card. This module names the **verb**: log an incoming
 * package (door write), identify onto an existing record (navigate), or settle
 * on the tape without navigating (known tracking, refused bytes, location
 * labels). It does not fetch or write — callers already paid for class +
 * object-state.
 *
 * Location / bin labels stay on the identification kernel. `routeScan` still
 * emits `/inventory?bin=…` for desktop; this land must not follow that
 * redirect or a floor scan leaves `/m/scan`.
 *
 * Unit labels land on the phone unit hub `/m/u/{key}` whatever their frame.
 * A GS1 `(01)(21)` / Digital Link unit routes to `/01/{gtin}/21/{serial}`,
 * which the GS1 resolver sends to the DESK page `/serial/{serial}`; the floor
 * must stay in the phone shell.
 *
 * FBA unit labels (FNSKU, `X00…`) land on the FNSKU hub `/m/fnsku/{fnsku}`
 * with an X back here. `routeScan` gives them no redirect so desk FBA stations
 * keep their scans; the phone opens the record here instead.
 *
 * QC is a session on this same kernel, not a second scan door: `/m/scan`
 * armed with `?work=qc` (`QC_SCAN_SESSION`, dispatch-table) turns a unit label into the
 * unit's checklist and a line label into a pick of that line's units.
 */

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
