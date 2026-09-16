/**
 * Which carrier owns a tracking number — resolved, not guessed twice.
 *
 * `shipping_tracking_numbers.carrier` is not decoration: it is the key the poll
 * loop filters on (`getDueShipments` → `ENABLED_SYNC_CARRIERS`). A row whose
 * carrier reads `UNKNOWN` is never polled, so it can never hold a status, and a
 * desk cannot tell that apart from "the carrier has not scanned it yet". On the
 * lane DB that was 1,002 rows whose carrier THIS repo's own detector can name
 * (506 USPS, 410 FedEx, 67 Amazon, 17 DHL, 2 GSO).
 *
 * So carrier becomes a DERIVED fact with provenance:
 *
 * - `detected` — `detectCarrierFromTracking`, the one pattern list
 *   (`@/utils/carrier-patterns`), shared with the scan resolver. There is no
 *   second copy here and there must never be one in SQL.
 * - `reported` — whatever the label, feed or operator claimed.
 * - `carrier` — the resolved value written to the column, always UPPERCASE.
 *
 * **Conflicts are reported, never silently resolved.** When both name a carrier
 * and they disagree, the caller gets `conflict: true` and decides; a backfill
 * must leave the row alone and queue it for a human. Two rows on the lane DB
 * are stored USPS while the pattern list reads them as UPU international
 * (`LX088692799IL`, `LM221449617CA`) — guessing either way is how a shipment
 * spends three months returning 404 under a catch-all `SYNC_ERROR`.
 *
 * Pure: no DB, no clock, no env.
 */

import { detectCarrierFromTracking, type CarrierCode } from '@/utils/carrier-patterns';

/** Absent carrier. Never polled — see {@link ENABLED_SYNC_CARRIERS}. */
export const UNKNOWN_CARRIER = 'UNKNOWN';

/**
 * The stored vocabulary is the detector's vocabulary, with one collapse:
 * UPS Mail Innovations tracks through the UPS API, so it is stored as UPS.
 * Everything else keeps its granular code, because "can we track this?" is a
 * per-integration question and collapsing DHL Express into a generic DHL throws
 * away the only fact that answers it.
 */
export function toStoredCarrier(code: CarrierCode | null | undefined): string {
  if (!code) return UNKNOWN_CARRIER;
  return code === 'UPS_MI' ? 'UPS' : code;
}

/** UPPERCASE, punctuation-free carrier token. The column holds only this shape. */
export function normalizeCarrierToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
}

export type CarrierSource =
  /** The pattern list named it. */
  | 'detected'
  /** The pattern list is silent; the label/feed's own word is all we have. */
  | 'reported'
  /** Neither names a carrier. */
  | 'unknown';

export interface ResolvedCarrier {
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

/**
 * Resolve the carrier for one tracking number.
 *
 * Precedence: a silent detector yields to the reported word; a detector that
 * names a carrier wins over an ABSENT or `UNKNOWN` report; a genuine
 * disagreement keeps the report and raises {@link ResolvedCarrier.conflict}.
 */
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
