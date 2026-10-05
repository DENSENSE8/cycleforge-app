/** Door scan → Arrival Card. */

import { isMarketplaceOrderNumber, routeScan, type ScanType } from '../barcode-routing';
import type { DisplayCarrier } from '@/utils/carrier-patterns';
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

/**
 * Plan a door scan from the TRACKING INTENT, not by re-routing the bytes: an
 * unconfirmed value the door sends to the server (`carrier: 'Unknown'`) does
 * not route as `carrier-tracking`, and re-routing it would settle it as known.
 */
export function planDoorScan(tracking: ArrivalTrackingIntent, trackingSeen: boolean): DoorScanPlan {
  const dispatch = dispatchScan({
    scan: { type: 'carrier-tracking', value: tracking.value, carrier: tracking.carrier },
    state: { trackingSeen },
  });
  return {
    card: dispatch.card,
    title: dispatch.title,
    destination: dispatch.destination,
    openArrival: dispatch.card === 'arrival',
    mintOnScan: false,
  };
}

type ArrivalTrackingIntent = { kind: 'tracking'; value: string; carrier: DisplayCarrier };

/**
 * How a value reached the door: read off a label (lens or wedge), or keyed by
 * the operator. Declared by the surface that captured it — never guessed from
 * the bytes.
 */
export type ScanInputSource = 'scanned' | 'typed';

/** What the ARRIVAL STATION can do with a scan, decided from the bytes and how they were captured. */
type ArrivalScanIntent =
  | ArrivalTrackingIntent
  | { kind: 'carton'; value: string; receivingId: number }
  | { kind: 'refused'; value: string; reason: string };

/**
 * A keyed tracking tail. Tracking identity is its last 8 digits (operator
 * 2026-10-04): when a carrier label will not scan, the operator types those 8
 * and the server's last-8 resolver finds the box. Only TYPED — a scanned bare
 * 8-digit label is a real house label (a Goodwill order / PO number), refused
 * below as before.
 */
const TYPED_LAST8_RE = /^\d{8}$/;

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

/** Classes that are always one of our own (or a product's) labels — never a box arriving. */
const HOUSE_TYPES: Partial<Record<ScanType, true>> = {
  'serial-unit': true,
  'handling-unit': true,
  'receiving-line': true,
  manifest: true,
  'support-ticket': true,
  fnsku: true,
  sscc: true,
  'bin-paired-order': true,
};

/**
 * A value the door can CONFIRM is a house label from its bytes alone. Anything
 * else that is not carrier tracking goes to the server's last-8 resolver.
 */
function isConfirmedHouse(value: string, redirect: string | undefined, type: ScanType): boolean {
  if (redirect || HOUSE_TYPES[type]) return true;
  // Static SKU (`123:…`), GS1 AI element string (`(01)…`), a link.
  if (/^\d/.test(value) && value.includes(':')) return true;
  if (/^\(\d{2,4}\)/.test(value)) return true;
  if (/^https?/i.test(value)) return true;
  // A digit-led part / serial number (`019158952630107AC`). Digit-led carrier
  // envelopes (1Z, FedEx 2D, USPS 420 with a separator) route as tracking above.
  if (/^\d/.test(value) && /[A-Za-z]/.test(value)) return true;
  // SKU (≤ 9 digits), EAN-13 / GTIN-14 — EAN-8 is in the first range.
  const digits = value.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits) && (digits.length <= 9 || digits.length === 13 || digits.length === 14)) {
    return true;
  }
  return value.replace(/\D/g, '').length < 8;
}

export function arrivalScanIntent(raw: string, source: ScanInputSource): ArrivalScanIntent {
  const value = raw.trim();

  if (source === 'typed') {
    const keyed = value.replace(/\s/g, '');
    if (TYPED_LAST8_RE.test(keyed)) return { kind: 'tracking', value: keyed, carrier: 'Unknown' };
  }

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

  if (isMarketplaceOrderNumber(value)) {
    return {
      kind: 'refused',
      value,
      reason: 'Nothing arrives under an order number. Scan the carrier label on the box.',
    };
  }

  if (isConfirmedHouse(value, route.redirect, route.type)) {
    const noun = REFUSED_NOUN[route.type] ?? 'that label';
    return {
      kind: 'refused',
      value,
      reason: `Nothing arrives under ${noun}. Scan the carrier label on the box.`,
    };
  }

  // Not confirmed house, not a known envelope: a carrier label the door does
  // not recognise. The server's last-8 resolver decides.
  return { kind: 'tracking', value, carrier: 'Unknown' };
}
