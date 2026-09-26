/** Which carrier owns a tracking number — resolved, not guessed twice. */

import { detectCarrierFromTracking, type CarrierCode } from '@/utils/carrier-patterns';

/** Absent carrier. Never polled — see {@link ENABLED_SYNC_CARRIERS}. */
export const UNKNOWN_CARRIER = 'UNKNOWN';

/** The stored vocabulary is the detector's vocabulary, with one collapse: */
export function toStoredCarrier(code: CarrierCode | null | undefined): string {
  if (!code) return UNKNOWN_CARRIER;
  return code === 'UPS_MI' ? 'UPS' : code;
}

/** A ShipStation v2 `carrier_code` in the stored vocabulary, or `null` when the code names no carrier we store. */
export function shipStationCarrierToStored(code: string | null | undefined): string | null {
  const c = String(code ?? '').trim().toLowerCase();
  if (!c) return null;
  if (c === 'usps' || c === 'stamps_com' || c === 'endicia' || c.startsWith('usps_')) return 'USPS';
  if (c === 'ups' || c.startsWith('ups_')) return 'UPS';
  if (c === 'fedex' || c.startsWith('fedex_')) return 'FEDEX';
  if (c === 'dhl_express' || c.startsWith('dhl_express_')) return 'DHL_EXPRESS';
  if (c === 'dhl_ecommerce' || c.startsWith('dhl_ecommerce_') || c === 'dhl_global_mail') return 'DHL_ECOMMERCE';
  if (c === 'ontrac') return 'ONTRAC';
  if (c === 'lasership') return 'LASERSHIP';
  if (c === 'gso') return 'GSO';
  if (c === 'amazon_shipping' || c === 'amazon_buy_shipping') return 'AMAZON';
  return null;
}

/** UPPERCASE, punctuation-free carrier token. The column holds only this shape. */
export function normalizeCarrierToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
}

type CarrierSource =
  /** The pattern list named it. */
  | 'detected'
  /** The pattern list is silent; the label/feed's own word is all we have. */
  | 'reported'
  /** Neither names a carrier. */
  | 'unknown';

interface ResolvedCarrier {
  /** Value to store in `shipping_tracking_numbers.carrier`. Always uppercase. */
  carrier: string;
  source: CarrierSource;
  /** What the pattern list said, uppercase, or null when silent. */
  detected: string | null;
  /** What the caller claimed, uppercase, or null when absent. */
  reported: string | null;
  /**
   * Both named a carrier and they disagree. `carrier` holds the REPORTED value
   * (we do not overwrite a human/vendor claim on a guess) and the row belongs in
   * a triage queue.
   */
  conflict: boolean;
}

/** Resolve the carrier for one tracking number. */
export function resolveStoredCarrier(input: {
  /** Raw or normalized tracking string — the detector normalizes either. */
  tracking: string | null | undefined;
  /** Carrier as claimed by the label, feed, or operator. */
  reported?: string | null;
}): ResolvedCarrier {
  const tracking = String(input.tracking ?? '').trim();
  const reportedToken = normalizeCarrierToken(input.reported);
  const reported = reportedToken && reportedToken !== UNKNOWN_CARRIER ? reportedToken : null;

  const detectedCode = tracking ? detectCarrierFromTracking(tracking) : null;
  const detected = detectedCode ? toStoredCarrier(detectedCode) : null;

  if (detected && reported && detected !== reported) {
    return { carrier: reported, source: 'reported', detected, reported, conflict: true };
  }
  if (detected) {
    return { carrier: detected, source: 'detected', detected, reported, conflict: false };
  }
  if (reported) {
    return { carrier: reported, source: 'reported', detected: null, reported, conflict: false };
  }
  return {
    carrier: UNKNOWN_CARRIER,
    source: 'unknown',
    detected: null,
    reported: null,
    conflict: false,
  };
}
