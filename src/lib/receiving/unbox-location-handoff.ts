/**
 * Unbox Location pill — WHAT a location scan places, and when its `L` key is
 * awake. Shared by the desk pill (scan / recent / `L` → phone) and the phone
 * LPN location screen, so both sides choose the same write:
 *
 *   - an open receiving line  → `POST /api/receiving/lines/:id/stage`
 *   - no line (an unfound LPN) → `POST /api/receiving/:id/arrival` place
 */

import { postArrivalAction } from './arrival-client';
import type { ArrivalPackage } from './arrival-contract';
import { postLineStage, type LineStageResponse } from './line-stage-client';
import { formatStagedLocationFace } from './recent-staged-location';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** Bare `L` (lowercase; a scanner's capitals never fire it — see createScanFieldLetterKey). */
export const UNBOX_LOCATION_HOTKEY = 'l';

export type UnboxLocationTarget =
  | { kind: 'line'; lineId: number; receivingId: number | null }
  | { kind: 'carton'; receivingId: number };

/** A real row id: carton-only rows carry a negative synthetic line id. */
const isRealId = (value: number | null | undefined): value is number =>
  value != null && Number.isSafeInteger(value) && value > 0;

/**
 * The write a scan lands on. A real line wins; without one the LPN itself is
 * placed — but only where the surface allows it (`cartonFallback`, Unbox).
 */
export function unboxLocationTarget(input: {
  lineId: number | null | undefined;
  receivingId: number | null | undefined;
  cartonFallback: boolean;
}): UnboxLocationTarget | null {
  const { lineId, receivingId } = input;
  if (isRealId(lineId)) return { kind: 'line', lineId, receivingId: isRealId(receivingId) ? receivingId : null };
  if (input.cartonFallback && isRealId(receivingId)) return { kind: 'carton', receivingId };
  return null;
}

/**
 * The pill's `L` is awake (key live, keycap painted): something to place, and
 * no text field or overlay holds the keyboard — there `L` is a letter.
 */
export function unboxLocationKeyAwake(input: {
  target: UnboxLocationTarget | null;
  editableFocused: boolean;
  overlayOpen: boolean;
}): boolean {
  return input.target != null && !input.editableFocused && !input.overlayOpen;
}

/** The putaway facts a `receiving.lines.stage` broadcast carries for one line. */
export interface LineStagePatch {
  id: number;
  staged_at: string | null;
  staged_location_id: number | null;
  staged_location_name: string | null;
  staged_location_barcode: string | null;
  staged_location_room: string | null;
}

/**
 * Read a `receiving-log.changed` message as THIS line's new putaway face, or
 * null when it is about another line / another write. Lets the desk pill
 * repaint when the phone placed the line (its row is local state, not a query).
 */
export function lineStagePatchFromRealtime(data: unknown, lineId: number): LineStagePatch | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as { source?: unknown; row?: unknown };
  if (msg.source !== 'receiving.lines.stage' || !msg.row || typeof msg.row !== 'object') return null;
  const row = msg.row as Record<string, unknown>;
  if (Number(row.receiving_line_id) !== lineId) return null;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  const locationId = Number(row.staged_location_id);
  return {
    id: lineId,
    staged_at: text(row.staged_at),
    staged_location_id: Number.isSafeInteger(locationId) && locationId > 0 ? locationId : null,
    staged_location_name: text(row.staged_location_name),
    staged_location_barcode: text(row.staged_location_barcode),
    staged_location_room: text(row.staged_location_room),
  };
}

export type LpnLocationPlaced =
  | { kind: 'line'; face: string; response: LineStageResponse }
  | { kind: 'carton'; face: string; pkg: ArrivalPackage };

/**
 * Place `target` on a scanned or typed location label. Throws the write's own
 * words (`No location has the label …`, `… is not an active location`,
 * `Location not found: …`).
 */
export async function placeLpnLocation(
  target: UnboxLocationTarget,
  scanned: string,
  opts: { surface: string },
): Promise<LpnLocationPlaced> {
  const label = scanned.trim();
  if (!label) throw new Error('Scan or type a location label');
  if (target.kind === 'line') {
    const response = await postLineStage(target.lineId, { barcode: label });
    const loc = response.location;
    const face = formatStagedLocationFace({ name: loc?.name, barcode: loc?.barcode, room: loc?.room }) || label;
    return { kind: 'line', face, response };
  }
  const pkg = await postArrivalAction(target.receivingId, {
    action: 'place',
    scanned: label,
    clientEventId: safeRandomUUID(),
    surface: opts.surface,
  });
  return { kind: 'carton', face: pkg.location?.code || pkg.location?.name || label, pkg };
}
