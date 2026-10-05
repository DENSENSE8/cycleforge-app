/**
 * Phone-only words of the rack screens (`/m/racks`, the rack and shelf
 * records, New rack, Move rack, Make movable rack): card detail lines and
 * operator sentences for rack-route failures. Placement text and print rows
 * are the shared `@/lib/locations/rack-display` helpers.
 */

import { RackRequestError } from '@/lib/locations/racks-client';
import type { RackErrorCode } from '@/lib/locations/rack-types';

export function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : nouns}`;
}

const RACK_ERROR_SENTENCES: Readonly<Record<RackErrorCode, string>> = {
  invalid: 'That request was not valid. Check the label and try again.',
  not_found: 'That rack does not exist any more.',
  destination_not_found: 'No room or floor spot has that label. Scan a room or floor label.',
  destination_kind: 'That label is not a room or a floor spot. A rack can only stand in a room or on a floor spot.',
  same_placement: 'The rack is already there.',
  shelf_has_stock: 'That shelf still holds stock or cartons. Move them off before removing it.',
  rack_in_use: 'That rack still holds stock, cartons, totes, or staged work. Move them off before deleting it.',
  not_a_rack: 'That label is not a rack. Scan the rack placard.',
  bay_not_found: 'No bay has that code.',
  bay_already_adopted: 'That bay is already a movable rack.',
};

/** One plain operator sentence for any rack-route failure. */
export function rackErrorSentence(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof RackRequestError) {
    if (error.code) return RACK_ERROR_SENTENCES[error.code];
    if (error.status === 401 || error.status === 403) return 'You do not have permission to change racks.';
    return error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
