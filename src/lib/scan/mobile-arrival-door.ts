/** Door scan → Arrival Card. */

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

interface DoorScanPlan {
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

/** What the ARRIVAL STATION can do with a scan, decided from the bytes alone. */
type ArrivalScanIntent =
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
  fnsku: 'an FBA label',
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
