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
 */

import type { ScanRoute } from '@/lib/barcode-routing';
import type { ScanDispatch } from '@/lib/scan/dispatch-table';

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
  if (route?.redirect) return { kind: 'identify', href: route.redirect };
  return { kind: 'settle' };
}
