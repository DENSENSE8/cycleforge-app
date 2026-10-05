/**
 * Movable-rack display words — pure, client-safe, shared by the phone
 * (`/m/racks`, the rack record) and the desk (Locations › Racks). The room is
 * the server's derived room (`RackSummary.room`); nothing here reads a code
 * letter or `locations.room`.
 */

import type { PrintableLocationRow } from '@/lib/print/printLocationRows';
import { RackRequestError } from '@/lib/locations/racks-client';
import type { RackDetail, RackErrorCode, RackPlacementRef, RackRoomRef } from '@/lib/locations/rack-types';

/**
 * Where the rack stands, in words: the room alone when it stands in the room
 * itself, `Floor spot 2 · Room C` when it stands on a spot inside one, the
 * spot alone when the chain reaches no room.
 */
export function rackPlacementText(rack: { placement: RackPlacementRef; room: RackRoomRef | null }): string {
  const { placement, room } = rack;
  if (!room || room.id === placement.id) return placement.name;
  return `${placement.name} · ${room.name}`;
}

/** `5 shelves`, `1 shelf`. */
export function rackShelfCountText(count: number): string {
  return `${count} ${count === 1 ? 'shelf' : 'shelves'}`;
}

/**
 * The rows a rack print run hands `useLocationLabelPrint`: the placard (the
 * rack's own row) first when asked, then the chosen shelves in shelf order.
 * No room travels — rack faces never print one.
 */
export function rackLabelRows(
  rack: Pick<RackDetail, 'id' | 'code' | 'name' | 'shelves'>,
  pick: { placard: boolean; shelfCodes: ReadonlySet<string> },
): PrintableLocationRow[] {
  const rows: PrintableLocationRow[] = [];
  if (pick.placard) rows.push({ id: rack.id, name: rack.name, barcode: rack.code, roomName: null });
  for (const shelf of [...rack.shelves].sort((a, b) => a.shelf - b.shelf)) {
    if (!pick.shelfCodes.has(shelf.code)) continue;
    rows.push({ id: shelf.id, name: shelf.name, barcode: shelf.code, roomName: null });
  }
  return rows;
}

/** What a refused rack request means, in one sentence an operator can act on. */
export const RACK_ERROR_SENTENCES: Readonly<Record<RackErrorCode, string>> = {
  invalid: 'That request was not valid — check the values and try again.',
  not_found: 'No rack has that code.',
  destination_not_found: 'No room or floor spot has that label.',
  destination_kind: 'That label is not a room or a floor spot — scan where the rack stands.',
  same_placement: 'The rack already stands there.',
  shelf_has_stock: 'That shelf still holds stock or cartons — move them off first.',
  rack_in_use: 'That rack still holds stock, cartons, totes, or staged work — move them off first.',
  not_a_rack: 'That code is not a rack.',
  bay_not_found: 'No bay has that code.',
  bay_already_adopted: 'This bay is already a movable rack.',
};

/** A thrown rack request as the sentence to show: the refusal's meaning, else the server's words. */
export function rackErrorMessage(err: unknown): string {
  if (err instanceof RackRequestError && err.code) return RACK_ERROR_SENTENCES[err.code];
  return err instanceof Error ? err.message : 'The rack request failed';
}
