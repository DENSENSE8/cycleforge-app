/**
 * Pack's own tape vocabulary — the station-specific half of the mobile
 * station tape.
 *
 * What is here is only what "a box was packed at the bench" means. The write
 * is the DESK's own: `POST /api/packerlogs` (idempotent by clientEventId,
 * server-trusted actor, station-activity + audit inside). Nothing new was
 * built server-side for this station — the operator's proposed context-read
 * turned out unnecessary because the write model is shipment-level: scan the
 * label on the box, the pack is recorded.
 * ## Two outcomes
 *
 * `packed` is the job: the label resolved and the pack row exists. `error` is
 * everything else — offline, unresolvable label, network. There is no
 * client-side "duplicate": the write is the desk's own and it does not report
 * one, so this station does not invent a verdict the server never gave.
 *
 * ## Offline is a no, like the door
 * See `MobilePackStation` — the write resolves the shipment server-side, so a
 * queue could not key its rows.
 */

import {
  stationDedupeKey,
  type StationTapeEntry,
  type StationTapeLabel,
} from '@/components/mobile/station/station-tape';

/** What the bench decided about one label scan. */
export type PackScanStatus = 'packed' | 'error';

/** What the bench knows once one scan has settled. */
export interface SettledPack {
  scan: string;
  status: PackScanStatus;
  /** The shipment the label resolved to, when it did. */
  shipmentId: number | null;
  /** The packer_log row the write created, for the photo deep link. */
  packerLogId: number | null;
  /** The server's own words for a refusal. */
  message: string | null;
}

/** What each outcome says, and how loud. */
export const PACK_TAPE_LABEL: StationTapeLabel<PackScanStatus> = {
  packed: { verb: 'Packed', tone: 'ok' },
  error: { verb: 'Not recorded', tone: 'bad' },
};


/** Namespace for this station's tape identity: one row per SHIPMENT. */
export const PACK_DEDUPE_KIND = 'shipment';

/** Turn one settled scan into a tape entry. */
export function packTapeEntry(settled: SettledPack, now: string): StationTapeEntry {
  const label = PACK_TAPE_LABEL[settled.status];
  return {
    id: `pack-${settled.scan}-${now}`,
    tone: label.tone,
    verb: label.verb,
    title: null,
    identifier: settled.scan,
    recordId: settled.shipmentId != null ? `Shipment ${settled.shipmentId}` : null,
    conditionGrade: null,
    imageUrl: null,
    actor: null,
    actorId: null,
    message: settled.message,
    at: now,
    dedupeKey:
      stationDedupeKey(PACK_DEDUPE_KIND, settled.shipmentId) ?? `scan:${settled.scan}`,
    live: true,
  };
}
