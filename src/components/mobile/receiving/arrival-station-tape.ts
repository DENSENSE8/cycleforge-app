/** Arrival's own tape vocabulary — the station-specific half of the mobile station tape. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { IntakeClass } from '@/design-system/tokens/intake';
import {
  stationDedupeKey,
  STATION_TAPE_LIMIT,
  type StationTapeEntry,
  type StationTapeLabel,
} from '@/lib/mobile/station-tape';

/** What the door decided about one scan. */
export type ArrivalScanStatus = 'arrived' | 'known' | 'refused' | 'err';

/** What each outcome says, and how loud. */
const ARRIVAL_TAPE_LABEL: StationTapeLabel<ArrivalScanStatus> = {
  arrived: { verb: 'Arrived', tone: 'ok' },
  known: { verb: 'Already arrived', tone: 'warn' },
  refused: { verb: 'Not an arrival', tone: 'bad' },
  err: { verb: 'Scan failed', tone: 'bad' },
};

/** Namespace for this station's tape identity: */
export const ARRIVAL_DEDUPE_KIND = 'carton';

/** What the station knows once one scan has settled. */
export interface SettledArrival {
  status: ArrivalScanStatus;
  /** Raw scanned value that produced this settle. */
  scanned: string;
  /** Submit order, monotonic per hook instance. Stable key for a tape row. */
  seq: number;
  /** The carton this scan landed on, when there is one. */
  receivingId: number | null;
  /** Product / PO name when the arrival resolved to one. Never the tracking. */
  title: string | null;
  /** The carrier number, canonicalised by the route when it could be. */
  tracking: string | null;
  /** The PO this carton belongs to, when it matched one. */
  recordId: string | null;
  /** Catalog photo, when the matched line has one. */
  imageUrl: string | null;
  /** The server's own words — a reason, a refusal, or what was logged. */
  message: string | null;
  /** True when the request never reached the server (offline, DNS, 5xx). */
  transportFailed?: boolean;
}

const trimmed = (value: unknown): string | null => {
  const s = String(value ?? '').trim();
  return s ? s : null;
};

/** The INTAKE class a carton's server facts name — the arrival-triage answer to "is it a return? */
function arrivalIntakeClass(
  row: Pick<ReceivingLineRow, 'carton_intake_type' | 'zendesk_ticket' | 'zoho_purchaseorder_id'>,
): IntakeClass | null {
  const type = trimmed(row.carton_intake_type)?.toUpperCase() ?? null;
  if (type === 'RETURN' || type === 'REPAIR_RETURN') return 'return';
  if (type === 'REPAIR' || type === 'REPAIR_SERVICE') return 'repair';
  if (type) return null;
  if (trimmed(row.zendesk_ticket)) return 'ticket';
  if (trimmed(row.zoho_purchaseorder_id)) return null;
  return 'unclassified';
}

/** Turn one settled scan into a tape entry. */
export function arrivalTapeEntry(
  settled: SettledArrival,
  now: number = Date.now(),
): StationTapeEntry {
  const label = ARRIVAL_TAPE_LABEL[settled.status];
  const transport = settled.status === 'err' && settled.transportFailed === true;

  return {
    id: `arrival-${settled.seq}`,
    tone: label.tone,
    verb: label.verb,
    // A named product when the carton resolved to one.
    title: trimmed(settled.title) ?? (settled.status === 'arrived' ? null : label.verb),
    identifier: trimmed(settled.tracking) ?? trimmed(settled.scanned),
    recordId: trimmed(settled.recordId),
    // Receiving has no grade at the door — the box is still shut.
    conditionGrade: null,
    imageUrl: trimmed(settled.imageUrl),
    // The operator's own scan: marking their own row is noise.
    actor: null,
    actorId: null,
    message: transport
      ? 'No connection — nothing was recorded. Scan it again once you have signal.'
      : trimmed(settled.message),
    at: new Date(now).toISOString(),
    // One row per carton. A refusal and a transport failure resolved to no
    // carton, so they stand alone: two wrong labels are two separate problems.
    dedupeKey: stationDedupeKey(ARRIVAL_DEDUPE_KIND, settled.receivingId),
    live: true,
    // A box minted by THIS scan is untyped by construction — unless it matched
    // a PO, which is not a triage question. A re-scan (`known`) does not carry
    // the carton's type back, so it claims no class rather than guess one.
    intake: settled.status === 'arrived' && !trimmed(settled.recordId) ? 'unclassified' : null,
  };
}

/** Collapse the line-level receiving feed into one tape row per CARTON, newest first — the tape's seed of what already came through the door. */
export function arrivalHistoryEntries(rows: readonly ReceivingLineRow[]): StationTapeEntry[] {
  const byCarton = new Map<number, StationTapeEntry>();

  for (const row of rows) {
    const receivingId = Number(row.receiving_id ?? 0);
    if (!Number.isFinite(receivingId) || receivingId <= 0) continue;
    if (byCarton.has(receivingId)) continue;

    // The DOOR time, in falling order of truth: when the carton was received,
    // else when its tracking was first scanned, else when the row was made.
    const at = trimmed(row.received_at) ?? trimmed(row.scanned_at) ?? trimmed(row.created_at);

    byCarton.set(receivingId, {
      id: `arrival-history-${receivingId}`,
      // Every seeded row is a box that made it in. The amber "already arrived"
      // reading belongs to a RE-SCAN in this session, not to yesterday's work
      // being yesterday's work.
      tone: 'ok',
      verb: ARRIVAL_TAPE_LABEL.arrived.verb,
      title:
        trimmed(row.catalog_product_title) ??
        trimmed(row.zoho_item_title) ??
        trimmed(row.item_name),
      identifier: trimmed(row.tracking_number),
      recordId: trimmed(row.zoho_purchaseorder_number) ?? trimmed(row.zoho_purchaseorder_id),
      conditionGrade: null,
      imageUrl: trimmed(row.image_url),
      // Whose door scan this was. The feed carries the NAME and not the id, so
      // the mark paints initials without a colour — still better than an
      // unattributed row, which is where the search for a lost carton starts.
      actor: trimmed(row.received_by_name) ?? trimmed(row.scanned_by_name),
      actorId: null,
      message: null,
      at: at ?? new Date().toISOString(),
      dedupeKey: stationDedupeKey(ARRIVAL_DEDUPE_KIND, receivingId),
      // Seeded, not scanned here: this may be another operator's work.
      live: false,
      intake: arrivalIntakeClass(row),
    });
  }

  return [...byCarton.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, STATION_TAPE_LIMIT);
}
