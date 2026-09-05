/**
 * Scan-out's own tape vocabulary — the station-specific half of the mobile
 * station tape.
 *
 * The generic half (the entry shape, the collapse, the cap) lives in
 * `@/components/mobile/station/station-tape`. What is here is only what "scan
 * out" means: which server outcomes exist, what each one says, and how loud.
 *
 * ## Why the tape is fed from every settle
 *
 * The dock gun is async and non-blocking (`useScanOutStation`): a submit clears
 * and refocuses BEFORE the network, so a fast operator has several confirms in
 * flight at once. The desk station header shows one carton — the latest settle.
 * The phone needs the shift's history instead, and it has to survive
 * out-of-order responses, so this is fed from `onSettled` (every settle, in
 * arrival order) rather than from the single `active` carton.
 *
 * Pure module: no React, no storage. Unit-tested in `mobile-scan-out-tape.test.ts`.
 */

import {
  stationDedupeKey,
  type StationTapeEntry,
  type StationTapeLabel,
} from '@/components/mobile/station/station-tape';
import type {
  ScanOutStatus,
  SettledScanOut,
} from '@/components/outbound/scan-out/useScanOutStation';

/**
 * What each outcome says, and how loud.
 *
 * `verb` no longer paints on a tape row — the row is title over identifier, and
 * a column of the same word carried no information (operator 2026-09-04). It
 * stays as the outcome's name for anything that needs to say it in words; `tone`
 * is what the row actually consumes.
 */
export const SCAN_OUT_TAPE_LABEL: StationTapeLabel<ScanOutStatus> = {
  ok: { verb: 'Scanned out', tone: 'ok' },
  /**
   * A re-read keeps the operator's wording — "Scanned out", because that is the
   * fact — but NOT the success tone.
   *
   * The two cases are not equally safe. A fresh confirm is the job. A re-read
   * means this box already left the building, which is a stop-work signal: the
   * package in the operator's hands is either the wrong one or one that has come
   * back. With the verb gone from the row, the tone and the stamp are the entire
   * distinction, and they have to carry it.
   */
  dup: { verb: 'Scanned out', tone: 'warn' },
  exc: { verb: 'Delivered already', tone: 'bad' },
  /**
   * The order must not ship. The strongest thing this station says, and the one
   * outcome that asks the operator to physically undo something they were about
   * to do rather than just noting a fact.
   */
  blk: { verb: 'Do not ship', tone: 'bad' },
  miss: { verb: 'No shipment', tone: 'bad' },
  err: { verb: 'Queued to send', tone: 'warn' },
  pending: { verb: 'Scanning', tone: 'warn' },
};

/** Namespace for this station's tape identity. Read back with `stationDedupeId`. */
export const SCAN_OUT_DEDUPE_KIND = 'shipment';

const trimmed = (value: unknown): string | null => {
  const s = String(value ?? '').trim();
  return s ? s : null;
};

/**
 * Turn one settled scan into a tape entry.
 *
 * `now` is injectable so the test does not race the clock.
 */
export function scanOutTapeEntry(
  settled: SettledScanOut,
  now: number = Date.now(),
): StationTapeEntry {
  const result = settled.result;
  const label = SCAN_OUT_TAPE_LABEL[settled.status];
  /**
   * A transport failure is not a refusal.
   *
   * The server never saw this scan, so nothing is known about the package — but
   * that is a statement about the NETWORK, not about the label. It used to
   * render as a red row headed "Unfound order", which blamed the operator's
   * barcode for the dock's wifi and offered nothing to do about it. It is amber,
   * it says it is queued, and the outbox will send it.
   */
  const queued = settled.status === 'err' && settled.transportFailed === true;

  /**
   * The commit landed but the server could not read the carton context.
   *
   * The package IS out. Leaving `title` null made the row print "Unfound order",
   * which states the opposite of what happened and would send an operator
   * chasing a package that shipped correctly.
   */
  const shippedWithoutContext =
    settled.status === 'ok' && !trimmed(result?.productTitle) && !trimmed(result?.orderId);
  const tracking = trimmed(result?.tracking) ?? settled.scanned.trim();

  // A duplicate already has a real departure time on the server. The re-read is
  // now, but the DEPARTURE is what the stamp has to report — that is how "1h"
  // tells the operator this one left an hour ago.
  const confirmedAt = trimmed(result?.shipConfirmedAt);
  const parsed = confirmedAt ? new Date(confirmedAt.replace(' ', 'T')).getTime() : NaN;

  return {
    id: `scan-out-${settled.seq}`,
    tone: label.tone,
    verb: label.verb,
    /**
     * The product title only. `null` when the shipment resolved without one, or
     * did not resolve at all — the row then leads with the label itself rather
     * than setting a 22-digit carrier number as a headline.
     */
    title: shippedWithoutContext ? 'Shipped — details unavailable' : trimmed(result?.productTitle),
    identifier: tracking || null,
    recordId: trimmed(result?.orderId),
    conditionGrade: trimmed(result?.condition),
    imageUrl: trimmed(result?.imageUrl),
    // The operator's own scan: marking their own row is noise.
    actor: null,
    actorId: null,
    message: queued
      ? 'Waiting for a connection. It will send itself.'
      : trimmed(result?.message),
    at: new Date(Number.isFinite(parsed) ? parsed : now).toISOString(),
    // One row per shipment. A miss resolved to nothing and so collapses with
    // nothing: two unreadable labels are two separate problems.
    dedupeKey: stationDedupeKey(SCAN_OUT_DEDUPE_KIND, Number(result?.shipmentId)),
    live: true,
  };
}

/** Outcomes that mean the package is out of the building. */
export function isScanOutCommitted(status: ScanOutStatus): boolean {
  return status === 'ok' || status === 'dup';
}
