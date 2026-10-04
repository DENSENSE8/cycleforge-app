/**
 * Reads a shipping label's text layer the way a person reads the label: by
 * position, not by string order. pdf.js hands back positioned glyph runs in
 * content order, which on real labels (ShipStation USPS, Pitney Bowes,
 * rotated thermal layouts) does not follow the printed layout — the tracking
 * number can come before its "USPS TRACKING #" caption, and the ship-to block
 * sits beside a "SHIP TO:" marker rather than after it.
 *
 * Pure: positioned items in, the recipient name and tracking candidates out.
 * Measured layouts (2026-10-03, real labels on file): ShipStation USPS prints
 * "SHIP" / "TO:" left of the recipient block; Pitney Bowes prints no marker,
 * rotates the page 90°, and names the origin as "From 92647".
 */

import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';

/** One pdf.js text item: `transform` is the [a b c d e f] text matrix. */
export interface LabelTextItem {
  str: string;
  transform: readonly number[];
  width?: number;
}

/** A run of text on one printed line, in the text's own upright frame. */
export interface TextRun {
  text: string;
  /** Quarter-turn the text is printed at (0–3). Runs only relate within one. */
  quarter: number;
  /** Start / end along the baseline. */
  u0: number;
  u1: number;
  /** Baseline height in the upright frame — larger is higher on the label. */
  v: number;
  size: number;
}

const QUARTER: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function toRun(item: LabelTextItem): TextRun | null {
  const text = item.str.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform;
  const quarter = ((Math.round(Math.atan2(b, a) / (Math.PI / 2)) % 4) + 4) % 4;
  const [cos, sin] = QUARTER[quarter]!;
  const size = Math.hypot(c, d) || Math.hypot(a, b) || 10;
  const u0 = e * cos + f * sin;
  const width = item.width && item.width > 0 ? item.width : text.length * size * 0.55;
  return { text, quarter, u0, u1: u0 + width, v: -e * sin + f * cos, size };
}

/**
 * Items → printed runs: items sharing a baseline join into one run unless a
 * gap wider than about a character height separates them (two columns on one
 * baseline — "SHIP" beside the recipient's name — stay two runs).
 */
export function layoutRuns(items: readonly LabelTextItem[]): TextRun[] {
  const pieces = items.map(toRun).filter((run): run is TextRun => run != null);
  pieces.sort((x, y) => x.quarter - y.quarter || y.v - x.v || x.u0 - y.u0);
  const lines: TextRun[][] = [];
  for (const piece of pieces) {
    const line = lines[lines.length - 1];
    const head = line?.[0];
    if (head && head.quarter === piece.quarter && Math.abs(head.v - piece.v) <= Math.max(head.size, piece.size) * 0.35) line!.push(piece);
    else lines.push([piece]);
  }
  const runs: TextRun[] = [];
  for (const line of lines) {
    line.sort((x, y) => x.u0 - y.u0);
    let current: TextRun | null = null;
    for (const piece of line) {
      if (current && piece.u0 - current.u1 <= Math.max(current.size, piece.size) * 1.2) {
        current.text = `${current.text} ${piece.text}`;
        current.u1 = Math.max(current.u1, piece.u1);
        current.size = Math.max(current.size, piece.size);
      } else {
        if (current) runs.push(current);
        current = { ...piece };
      }
    }
    if (current) runs.push(current);
  }
  return runs;
}

// ─── Ship-to name ────────────────────────────────────────────────────────────

/** `TROY NY 12180-6566`, `Huntington Beach, CA 92647` — a US last line. */
const CITY_STATE_ZIP = /[A-Za-z][A-Za-z .'-]*,?\s+[A-Z]{2}\s+(\d{5})(?:-\d{4})?$/;
const SHIP_TO_MARKER = /^(?:ship\s*to|ship|deliver\s*to|to)\s*:?$/i;
const LEADING_MARKER = /^(?:ship\s*to|deliver\s*to)\s*:?\s*/i;
const ORIGIN_ZIP = /^(?:ship\s*)?from:?\s+(\d{5})\b/i;

interface AddressBlock {
  /** Top line first, city/state/ZIP last. */
  lines: TextRun[];
  zip: string;
}

/** Walk up from a city/state/ZIP line through the left-aligned lines above it. */
function blockAbove(last: TextRun, runs: readonly TextRun[], zip: string): AddressBlock {
  const lines = [last];
  let pitch: number | null = null;
  for (let current = last; lines.length < 6; ) {
    const reach: number = pitch == null ? current.size * 2.4 : pitch * 1.6;
    let next: TextRun | null = null;
    for (const run of runs) {
      if (run.quarter !== current.quarter || run === current) continue;
      if (Math.abs(run.u0 - last.u0) > Math.max(2, last.size * 0.6)) continue;
      const rise = run.v - current.v;
      if (rise <= 0 || rise > reach) continue;
      if (!next || rise < next.v - current.v) next = run;
    }
    if (!next) break;
    pitch ??= next.v - current.v;
    lines.unshift(next);
    current = next;
  }
  return { lines, zip };
}

/** The block's addressee: its top line that reads as a name, not a marker, street, or phone. */
function addressee(block: AddressBlock): string | null {
  for (const run of block.lines.slice(0, -1)) {
    if (SHIP_TO_MARKER.test(run.text)) continue;
    const text = run.text.replace(LEADING_MARKER, '').trim();
    if (!text || /^\d/.test(text) || /^p\.?\s*o\.?\s*box\b/i.test(text)) continue;
    if ((text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length < 2) continue;
    return text.slice(0, 160);
  }
  return null;
}

/**
 * The recipient's name as printed. The ship-to block is the address block a
 * "SHIP TO" marker sits beside; without a marker, the block that is not the
 * printed origin ZIP; then the block printed largest; then the lowest one
 * (labels print the return address above the recipient). Null when no block
 * is readable — the caller falls back to tracking.
 */
export function readShipToName(runs: readonly TextRun[]): string | null {
  const blocks: AddressBlock[] = [];
  for (const run of runs) {
    const zip = CITY_STATE_ZIP.exec(run.text)?.[1];
    if (zip) blocks.push(blockAbove(run, runs, zip));
  }
  const named = blocks.filter((block) => block.lines.length >= 2 && addressee(block) != null);
  if (!named.length) return null;

  const markers = runs.filter((run) => SHIP_TO_MARKER.test(run.text) || LEADING_MARKER.test(run.text));
  const beside = named.filter((block) => {
    const top = block.lines[0]!;
    const last = block.lines[block.lines.length - 1]!;
    return markers.some((marker) => marker.quarter === top.quarter
      && marker.u0 <= top.u0 + top.size
      && marker.v >= last.v - top.size
      && marker.v <= top.v + top.size * 2);
  });
  if (beside.length === 1) return addressee(beside[0]!);

  const origin = runs.map((run) => ORIGIN_ZIP.exec(run.text)?.[1]).find(Boolean);
  const pool = (beside.length ? beside : named).filter((block) => block.zip !== origin);
  if (!pool.length) return null;
  const ranked = [...pool].sort((x, y) => y.lines[0]!.size - x.lines[0]!.size || x.lines[x.lines.length - 1]!.v - y.lines[y.lines.length - 1]!.v);
  return addressee(ranked[0]!);
}

// ─── Tracking ────────────────────────────────────────────────────────────────

const TRACKING_MARKER = /tracking/i;

export interface TrackingRead {
  raw: string;
  normalized: string;
  carrier: string;
}

/**
 * One printed or decoded value as a tracking number, or null. `strongOnly`
 * accepts just the unmistakable UPS (1Z…) and USPS (9…, 20–22 digits) shapes —
 * for values read away from a TRACKING caption, and for decoded barcodes
 * (a USPS IMpb's 420+ZIP envelope is stripped by the normalizer).
 */
export function readTrackingValue(raw: string, strongOnly: boolean): TrackingRead | null {
  const normalized = normalizeTrackingNumber(raw);
  if (normalized.length < 12) return null;
  const carrier = detectCarrier(normalized);
  if (!carrier) return null;
  // Away from a TRACKING caption a bare 12-digit run is as likely an order or
  // meter number as a FedEx Express number — only the unmistakable shapes count.
  if (strongOnly && !/^1Z[A-Z0-9]{16}$/.test(normalized) && !/^9\d{19,21}$/.test(normalized)) return null;
  return { raw: raw.trim(), normalized, carrier };
}

/** What a run offers as a tracking number: the whole run, and the part after its caption. */
function trackingTexts(run: TextRun): string[] {
  const out = [run.text];
  const after = run.text.split(/[#:]/).pop();
  if (after && after !== run.text) out.unshift(after);
  return out;
}

/**
 * The label's tracking number from its text layer: the run carrying a
 * TRACKING caption, then the runs nearest that caption, then any run that
 * holds an unmistakable UPS (1Z…) or USPS (9…, 20–22 digits) number.
 */
export function readTrackingFromRuns(runs: readonly TextRun[]): TrackingRead | null {
  const captions = runs.filter((run) => TRACKING_MARKER.test(run.text));
  for (const caption of captions) {
    for (const text of trackingTexts(caption)) {
      const read = readTrackingValue(text, false);
      if (read) return read;
    }
  }
  for (const caption of captions) {
    const near = runs
      .filter((run) => run !== caption && run.quarter === caption.quarter)
      .map((run) => ({ run, distance: Math.hypot(run.u0 - caption.u0, run.v - caption.v) }))
      .filter(({ distance }) => distance <= caption.size * 12)
      .sort((x, y) => x.distance - y.distance);
    for (const { run } of near.slice(0, 3)) {
      const read = readTrackingValue(run.text, false);
      if (read) return read;
    }
  }
  for (const run of runs) {
    for (const text of trackingTexts(run)) {
      const read = readTrackingValue(text, true);
      if (read) return read;
    }
  }
  return null;
}
