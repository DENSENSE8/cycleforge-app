/**
 * The scan page's own tape, kept for this tab session so the scan → location
 * → scan loop comes back to the rows it left instead of an empty list. Rows
 * carry random ids: a remounted page restarts its counters, and a counter id
 * would collide with a restored row.
 */

import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { recordMobileSessionEntry } from '@/lib/mobile/mobile-session-feed';
import { pushStationTape, STATION_TAPE_LIMIT, type StationTapeEntry } from '@/lib/mobile/station-tape';
import { stockAdjustSummary, type StockAdjustEntry } from '@/lib/mobile/stock-adjust-session';
import { safeRandomUUID } from '@/lib/safe-uuid';

const SCAN_TAPE_STORAGE_KEY = 'cf.mobile.scan-tape.v1';
/** Tape rows for a location open its record; the key is how the tape finds the code again. */
export const LOCATION_TAPE_KEY_PREFIX = 'location:';

function isTapeEntry(value: unknown): value is StationTapeEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<StationTapeEntry>;
  return (
    typeof row.id === 'string'
    && (row.tone === 'ok' || row.tone === 'warn' || row.tone === 'bad')
    && typeof row.verb === 'string'
    && typeof row.at === 'string'
    && (row.dedupeKey == null || typeof row.dedupeKey === 'string')
  );
}

export function readScanTape(): StationTapeEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(SCAN_TAPE_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isTapeEntry).slice(0, STATION_TAPE_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeScanTape(tape: readonly StationTapeEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SCAN_TAPE_STORAGE_KEY, JSON.stringify(tape.slice(0, STATION_TAPE_LIMIT)));
  } catch {
    // Storage blocked: the tape still works for this visit.
  }
}

/** The tape row for a location that opened its record. */
export function locationTapeEntry(code: string): StationTapeEntry {
  const segs = parseLocationCodeFlat(code);
  return {
    id: `location-${safeRandomUUID()}`,
    tone: 'ok',
    verb: 'Location',
    title: 'Location',
    identifier: segs ? locationCode(segs) : code,
    recordId: null,
    conditionGrade: null,
    imageUrl: null,
    actor: null,
    actorId: null,
    message: 'Opened the location record',
    at: new Date().toISOString(),
    dedupeKey: `${LOCATION_TAPE_KEY_PREFIX}${code.toUpperCase()}`,
    live: true,
  };
}

/** The phone's Current session row for a location visit. */
export function recordLocationVisit(entry: StationTapeEntry, href: string): void {
  recordMobileSessionEntry({
    id: entry.id,
    job: 'display',
    title: entry.title,
    identifier: entry.identifier,
    entityId: null,
    state: 'done',
    href,
    at: entry.at,
    dedupeKey: entry.dedupeKey ? `display:${entry.dedupeKey}` : null,
  });
}

/** A location scanned away from the scan page (on its record) still joins the tape and the session. */
export function appendLocationScan(code: string, href: string): void {
  const entry = locationTapeEntry(code);
  writeScanTape(pushStationTape(readScanTape(), entry));
  recordLocationVisit(entry, href);
}

/**
 * The tape as the scan page paints it: a location row says what was adjusted
 * there, and a location adjusted without a scan row of its own (walked to with
 * Next, opened from a list) still gets one — newest first.
 */
export function withStockAdjusts(
  tape: readonly StationTapeEntry[],
  adjusts: readonly StockAdjustEntry[],
): StationTapeEntry[] {
  const rows = tape.map((row) => {
    if (!row.dedupeKey?.startsWith(LOCATION_TAPE_KEY_PREFIX)) return row;
    const summary = stockAdjustSummary(adjusts, row.dedupeKey.slice(LOCATION_TAPE_KEY_PREFIX.length));
    // The row's title is what changed there ("TMP-1 +2"); the face stays its identifier.
    return summary ? { ...row, verb: 'Adjusted', title: summary, message: summary } : row;
  });
  const shown = new Set(rows.map((row) => row.dedupeKey));
  // Adjusts are newest first, so each location's first entry is its latest.
  for (const adjust of adjusts) {
    const key = `${LOCATION_TAPE_KEY_PREFIX}${adjust.code.toUpperCase()}`;
    if (shown.has(key)) continue;
    shown.add(key);
    const summary = stockAdjustSummary(adjusts, adjust.code);
    if (!summary) continue;
    rows.push({
      id: `adjust-${key}`,
      tone: 'ok',
      verb: 'Adjusted',
      title: summary,
      identifier: adjust.face,
      recordId: null,
      conditionGrade: null,
      imageUrl: null,
      actor: null,
      actorId: null,
      message: summary,
      at: adjust.at,
      dedupeKey: key,
      live: true,
    });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, STATION_TAPE_LIMIT);
}
