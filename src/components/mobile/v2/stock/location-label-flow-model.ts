/**
 * Pure model of the phone's label flow (`/m/stock/labels`): Rack → Shelves →
 * Print. One rack's placard and shelves are the printable set; every one
 * starts selected. No room anywhere: the rack is the unit, its labels never
 * name where it stands.
 */

import { rackLabelRows } from '@/lib/locations/rack-display';
import type { RackDetail, RackShelf } from '@/lib/locations/rack-types';
import type { PrintableLocationRow } from '@/lib/print/printLocationRows';

/** The placard's key in a selection — shelf keys are their codes (`RK12-3`), never this. */
export const PLACARD_KEY = 'placard';

/** The rack's shelves in shelf order — what the Shelves step lists under the placard. */
export function labelShelves(rack: Pick<RackDetail, 'shelves'>): RackShelf[] {
  return [...rack.shelves].sort((a, b) => a.shelf - b.shelf);
}

/** Keys of every label the Shelves step shows: the placard, then the shelves in shelf order. */
export function shownLabelKeys(rack: Pick<RackDetail, 'shelves'>): string[] {
  return [PLACARD_KEY, ...labelShelves(rack).map((shelf) => shelf.code)];
}

/** Every label of the rack, selected: what Shelves opens with. */
export function allLabelKeys(rack: Pick<RackDetail, 'shelves'>): Set<string> {
  return new Set(shownLabelKeys(rack));
}

/** The print run: the selected labels, placard first, shelves in shelf order. */
export function labelRows(
  rack: Pick<RackDetail, 'id' | 'code' | 'name' | 'shelves'>,
  selected: ReadonlySet<string>,
): PrintableLocationRow[] {
  return rackLabelRows(rack, {
    placard: selected.has(PLACARD_KEY),
    shelfCodes: new Set(rack.shelves.filter((shelf) => selected.has(shelf.code)).map((shelf) => shelf.code)),
  });
}
