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

import { routeScan, type ScanType } from '../barcode-routing';
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

/**
 * What the ARRIVAL STATION can do with a scan, decided from the bytes alone.
 *
 * `planDoorScan` answers "which Card", which needs prior state and therefore a
 * network read. This answers the question that comes BEFORE it — is this thing
 * even an arrival? — and answers it with no state and no I/O, so a product
 * label scanned at the door is refused instantly instead of costing a preview
 * round-trip and then minting a carton for a SKU.
 *
 * Three answers, and each is a different next move:
 *
 *  - `tracking` — a carrier label. The station reads whether we have seen it
 *    (preview) and then either logs the arrival or reports the carton.
 *  - `carton`   — one of OUR printed carton stickers. The receiving id is IN
 *    the label, so this needs no lookup at all: the box is already in the
 *    system by construction.
 *  - `refused`  — anything else. Nothing arrives under a bin, a unit or a
 *    ticket, and minting a carton for one is how phantom boxes are born.
 */
export type ArrivalScanIntent =
  | { kind: 'tracking'; value: string; carrier: string }
  | { kind: 'carton'; value: string; receivingId: number }
  | { kind: 'refused'; value: string; reason: string };

/**
 * What each refusable class IS, in the operator's words.
 *
 * The message has to name the thing they just scanned, or "not an arrival" reads
 * as a broken station rather than as the wrong label on a good one.
 */
const REFUSED_NOUN: Partial<Record<ScanType, string>> = {
  sku: 'a product label',
  bin: 'a bin label',
  'bin-paired-order': 'a bin label',
  'receiving-line': 'a line label',
  'serial-unit': 'a unit label',
  'handling-unit': 'a licence plate',
  sscc: 'a licence plate',
  manifest: 'a kit label',
  'support-ticket': 'a ticket',
};

/** Our own carton sticker carries its receiving id in the redirect it routes to. */
const CARTON_REDIRECT_RE = /^\/m\/r\/(\d+)$/;

export function arrivalScanIntent(raw: string): ArrivalScanIntent {
  const value = raw.trim();
  const route = value ? routeScan(value) : null;

  // Unroutable bytes. NOT a silent no-op: the operator scanned something, and a
  // station that says nothing looks like a station that missed the read.
  if (!route) {
    return {
      kind: 'refused',
      value,
      reason: 'That is not a carrier tracking number. Scan the carrier label on the box.',
    };
  }

  if (route.type === 'carrier-tracking') {
    return { kind: 'tracking', value: route.value, carrier: route.carrier ?? 'Unknown' };
  }

  const carton = CARTON_REDIRECT_RE.exec(route.redirect ?? '');
  if (carton) return { kind: 'carton', value, receivingId: Number(carton[1]) };

  const noun = REFUSED_NOUN[route.type] ?? 'that label';
  return {
    kind: 'refused',
    value,
    reason: `Nothing arrives under ${noun}. Scan the carrier label on the box.`,
  };
}
