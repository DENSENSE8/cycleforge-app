/**
 * Door scan → Arrival Card. The live `/m/scan` wiring law.
 *
 * Overnight dump 2026-09-04: `/api/receiving/lookup-po` minted an unfound
 * carton for a never-seen tracking (`UNFOUND · Carton logged for triage`), so
 * `verdict.receivingId` was set and `dispatchScan` returned `carton`, never
 * `arrival`. The Card and its tests were green in isolation; the wiring was
 * lying about `trackingSeen`.
 *
 * `trackingSeen` is decided from a READ (`/api/receiving/preview-scan`, which
 * creates nothing). The Card paints without a lookup-po write. Minting is a
 * verb on the Card (Unbox now), not a side-effect of the scan.
 *
 * Plan: docs/warehouse-os/PLAN-scan-shell-mobile.md → G2.
 */

import { routeScan } from '../barcode-routing';
import { dispatchScan, type ScanCard } from './dispatch-table';

export function isCarrierTrackingScan(raw: string): boolean {
  return routeScan(raw)?.type === 'carrier-tracking';
}

/**
 * Preview match is the only honest "we have seen this tracking" signal.
 * A minted `receivingId` from lookup-po is NOT this — that is how the Card
 * became unreachable.
 */
export function trackingSeenFromPreview(matched: boolean | undefined | null): boolean {
  return matched === true;
}

export interface DoorScanPlan {
  card: ScanCard;
  title: string | null;
  destination: string;
  /** True when `/m/scan` should mount ArrivalCard and skip lookup-po. */
  openArrival: boolean;
  /** Always false. Minting is a verb (Unbox now), not a scan. */
  mintOnScan: false;
}

export function planDoorScan(raw: string, trackingSeen: boolean): DoorScanPlan {
  const dispatch = dispatchScan({ scan: raw, state: { trackingSeen } });
  return {
    card: dispatch.card,
    title: dispatch.title,
    destination: dispatch.destination,
    openArrival: dispatch.card === 'arrival',
    mintOnScan: false,
  };
}
