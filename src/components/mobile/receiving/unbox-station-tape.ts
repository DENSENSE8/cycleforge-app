/**
 * Unbox's own tape vocabulary — the station-specific half of the mobile
 * station tape, exactly as the door and the dock each carry theirs.
 *
 * What is here is only what "a carton hit the unbox bench" means: which
 * outcomes exist, what each says, how loud. The loop that fills it
 * (`MobileUnboxStation`) is the same lookup-po rung the door and the desktop
 * bench use — this file knows nothing about it.
 *
 * ## Four outcomes
 *
 * `pending` is the optimistic row painted before the read settles.
 * `matched` is the job: the carton resolved to a PO, open it. `unfound` is
 * the stop-work signal — nothing matched, go find why (the row links to the
 * carton's UnfoundMatchStrip on the desk). `error` is the bench's wifi.
 * An `expedited` verdict is a matched carton somebody is waiting on — it gets
 * the warn ground, because "open this one FIRST" is the only ranking the
 * bench has.
 *
 * Pure module: no React, no storage. Unit-tested in `unbox-station-tape.test.ts`.
 */

import {
  stationDedupeKey,
  type StationTapeEntry,
  type StationTapeLabel,
} from '@/components/mobile/station/station-tape';

/** What the bench knows about one carton scan. Mirrors the loop's ScanResult. */
export interface UnboxScanInput {
  /** Submit-ordered stable key (the loop's temp id). */
  id: string;
  tracking: string;
  status: 'matched' | 'unmatched' | 'pending' | 'error';
  poLabel: string | null;
  receivingId: number | null;
  lineCount: number;
  /** Triage ranking once resolved. */
  verdict: 'expedited' | 'normal' | 'unfound' | null;
}

/** What each outcome says, and how loud. */
export const UNBOX_TAPE_LABEL: StationTapeLabel<UnboxScanInput['status']> = {
  pending: { verb: 'Looking up', tone: 'ok' },
  matched: { verb: 'Matched', tone: 'ok' },
  unmatched: { verb: 'Unfound', tone: 'warn' },
  error: { verb: 'Lookup failed', tone: 'bad' },
};

/** Namespace for this station's tape identity: one row per CARTON, same as
 *  the door — a re-read refreshes the row it already made. */
export const UNBOX_DEDUPE_KIND = 'carton';

/**
 * Turn one scan (any state) into a tape entry. The `at` stamp comes from the
 * scan, not from render time, so a re-read keeps its original clock.
 */
export function unboxTapeEntry(scan: UnboxScanInput, at: string): StationTapeEntry {
  const label = UNBOX_TAPE_LABEL[scan.status];
  const expeditedFirst = scan.status === 'matched' && scan.verdict === 'expedited';
  const lineNote =
    scan.status === 'matched' && scan.lineCount > 0
      ? `${scan.lineCount} line${scan.lineCount === 1 ? '' : 's'}`
      : null;

  return {
    id: scan.id,
    tone: expeditedFirst ? 'warn' : label.tone,
    verb: expeditedFirst ? 'Unbox first' : label.verb,
    title: scan.poLabel,
    identifier: scan.tracking,
    recordId: scan.poLabel,
    conditionGrade: null,
    imageUrl: null,
    actor: null,
    actorId: null,
    message: lineNote,
    at,
    dedupeKey: stationDedupeKey(UNBOX_DEDUPE_KIND, scan.receivingId) ?? `tracking:${scan.tracking}`,
    live: true,
  };
}

/** The bench's status line: counts as verdicts settle, never from the tape
 *  (it is capped — counting from it starts lying at row 41). */
export function unboxStatus(
  scans: readonly { status: UnboxScanInput['status']; verdict: UnboxScanInput['verdict'] }[],
): string {
  if (scans.length === 0) return 'Nothing scanned yet';
  let matched = 0;
  let unfound = 0;
  let expedited = 0;
  let pending = 0;
  for (const s of scans) {
    if (s.status === 'pending') pending += 1;
    else if (s.status === 'matched' || s.status === 'unmatched') {
      if (s.verdict === 'unfound' || s.status === 'unmatched') unfound += 1;
      else if (s.verdict === 'expedited') expedited += 1;
      else matched += 1;
    }
  }
  const parts: string[] = [];
  if (pending) parts.push(`${pending} in flight`);
  if (expedited) parts.push(`${expedited} first`);
  parts.push(`${matched} matched`);
  if (unfound) parts.push(`${unfound} unfound`);
  return parts.join(' · ');
}
