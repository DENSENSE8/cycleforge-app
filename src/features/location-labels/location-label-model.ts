/**
 * Pure model of the one location label builder (`LocationLabelBuilder`): the
 * steps an address walks, how a scanned or typed sticker becomes a selection,
 * the face a single label prints, and what the one Print verb says. A label
 * with no position reads `C-03-10-3` — there is no separate bay label.
 */

import {
  LOCATION_BAY_LABEL,
  locationCode,
  parseLocationCodeFlat,
  rackCode,
  unwrapScannedLocation,
  type LocationSegments,
} from '@/lib/barcode-routing';

export type LabelStep = 'zone' | 'aisle' | 'bay' | 'level' | 'position';

const STEP_LABEL: Record<LabelStep, string> = {
  zone: 'Zone',
  aisle: 'Aisle',
  bay: LOCATION_BAY_LABEL,
  level: 'Level',
  position: 'Position',
};

export const LABEL_STEPS: readonly { id: LabelStep; label: string }[] = (
  ['zone', 'aisle', 'bay', 'level', 'position'] as const
).map((id) => ({ id, label: STEP_LABEL[id] }));

/** The address picked so far; `room` is the room name (its zone letter comes from the room). */
export interface LabelSelection {
  room?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  position?: number;
}

/** The first step still open — the step the builder shows when the operator has not jumped back. */
export function nextLabelStep(s: LabelSelection): LabelStep {
  if (!s.room) return 'zone';
  if (s.aisle == null) return 'aisle';
  if (s.bay == null) return 'bay';
  if (s.level == null) return 'level';
  return 'position';
}

/** One label's segments, or null until zone + aisle + bay + level are known. No position = position 0. */
export function labelSegments(zoneLetter: string | undefined, s: LabelSelection): LocationSegments | null {
  if (!zoneLetter || s.aisle == null || s.bay == null || s.level == null) return null;
  return { zone: zoneLetter, aisle: s.aisle, bay: s.bay, level: s.level, position: s.position ?? 0 };
}

/** The code a sticker reads: `C-03-10-3-05`, or `C-03-10-3` with no position. */
export function labelFace(segments: LocationSegments): string {
  return Number(segments.position) > 0
    ? locationCode(segments)
    : rackCode({ zone: segments.zone, aisle: segments.aisle, bay: segments.bay, level: segments.level });
}

const DASHED_CODE_RE = /^([A-Z])-?(\d{1,2})-(\d{1,2})-(\d{1,2})(?:-(\d{1,2}))?$/;

/**
 * A scanned or typed sticker → its segments. Takes the flat barcode (`C0310300`),
 * a GS1 / URL scan, or the printed face (`C-03-10-3`, `C-03-10-3-05`). Null when it
 * is not a room-coded location.
 */
export function parseLabelCode(raw: string): LocationSegments | null {
  // The printed face first: the scan unwrapper strips its dashes, which loses `C-03-10-3`'s missing position.
  const m = DASHED_CODE_RE.exec(String(raw ?? '').trim().toUpperCase());
  if (!m) return parseLocationCodeFlat(unwrapScannedLocation(raw).toUpperCase());
  const [aisle, bay, level, position] = [m[2], m[3], m[4], m[5] ?? '0'].map((n) => parseInt(n, 10));
  if (![aisle, bay, level].every((n) => n >= 1 && n <= 99) || position < 0 || position > 99) return null;
  return { zone: m[1], aisle, bay, level, position };
}

/** The rooms that wear a zone letter, in room order (a scan names the letter, not the room). */
export function roomsForZone(rooms: readonly string[], zoneMap: Readonly<Record<string, string>>, zone: string): string[] {
  return rooms.filter((room) => zoneMap[room] === zone);
}

export type PrintVerbState = {
  run: boolean;
  printing: boolean;
  selection: LabelSelection;
  missingLetter: boolean;
  /** Single mode: the one label; run mode: unused. */
  single: LocationSegments | null;
  /** Run mode: the labels still ticked. */
  runCount: number;
  /** Why the chosen printer cannot take the job; null when it can. */
  printerBlocked: string | null;
};

export type PrintVerb = { label: string; ready: boolean; needsPrinter: boolean };

/** The dock's one primary: what it prints, or — disabled — exactly what is still missing (R9). */
export function printVerb(s: PrintVerbState): PrintVerb {
  const missing = (label: string): PrintVerb => ({ label, ready: false, needsPrinter: false });
  if (s.printing) return missing('Printing…');
  if (!s.selection.room) return missing('Pick a room');
  if (s.missingLetter) return missing('Assigning zone…');
  if (s.selection.aisle == null) return missing('Pick an aisle');
  if (!s.run) {
    if (s.selection.bay == null) return missing(`Pick a ${LOCATION_BAY_LABEL.toLowerCase()}`);
    if (s.selection.level == null || !s.single) return missing('Pick a level');
  } else if (s.runCount === 0) {
    return missing('Choose labels to print');
  }
  if (s.printerBlocked) return { label: 'Choose a printer', ready: true, needsPrinter: true };
  const label = s.run
    ? `Print ${s.runCount} label${s.runCount === 1 ? '' : 's'}`
    : `Print ${labelFace(s.single!)}`;
  return { label, ready: true, needsPrinter: false };
}
