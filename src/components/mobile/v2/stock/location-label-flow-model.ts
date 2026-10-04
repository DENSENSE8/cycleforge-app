/**
 * Pure model of the phone's label flow (`/m/stock/labels`): Rack → Shelves →
 * Print. One rack's placard and shelves are the printable set; every one
 * starts selected, "Arrival shelves only" narrows the set to the tiered
 * shelves (the placard carries no tier, so it drops out). No room anywhere:
 * the rack is the unit, its labels never name where it stands.
 */

import { rackLabelRows } from '@/lib/locations/rack-display';
import type { RackDetail, RackShelf } from '@/lib/locations/rack-types';
import type { PrintableLocationRow } from '@/lib/print/printLocationRows';

/** The placard's key in a selection — shelf keys are their codes (`RK12-3`), never this. */
export const PLACARD_KEY = 'placard';

/** Every label of the rack, selected: what Shelves opens with. */
export function allLabelKeys(rack: Pick<RackDetail, 'shelves'>): Set<string> {
  return new Set([PLACARD_KEY, ...rack.shelves.map((shelf) => shelf.code)]);
}

/** What the Shelves step lists: the placard (unless arrival-only) and the shelves, shelf order. */
export function labelChoices(
  rack: Pick<RackDetail, 'shelves'>,
  arrivalOnly: boolean,
): { placard: boolean; shelves: RackShelf[] } {
  const shelves = [...rack.shelves].sort((a, b) => a.shelf - b.shelf);
  return arrivalOnly
    ? { placard: false, shelves: shelves.filter((shelf) => shelf.tier != null) }
    : { placard: true, shelves };
}

/** Keys of everything the Shelves step currently shows. */
export function shownLabelKeys(choices: { placard: boolean; shelves: readonly RackShelf[] }): string[] {
  return [...(choices.placard ? [PLACARD_KEY] : []), ...choices.shelves.map((shelf) => shelf.code)];
}

/** The print run: selected AND shown, placard first, shelves in shelf order. */
export function labelRows(
  rack: Pick<RackDetail, 'id' | 'code' | 'name' | 'shelves'>,
  selected: ReadonlySet<string>,
  arrivalOnly: boolean,
): PrintableLocationRow[] {
  const choices = labelChoices(rack, arrivalOnly);
  return rackLabelRows(rack, {
    placard: choices.placard && selected.has(PLACARD_KEY),
    shelfCodes: new Set(choices.shelves.filter((shelf) => selected.has(shelf.code)).map((shelf) => shelf.code)),
  });
}
