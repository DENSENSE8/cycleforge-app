/**
 * Listing serials (`receiving_line_listing_serial`) — the serials the purchase
 * listing showed, which unbox confirms by adding that serial to the line.
 * `POST /api/receiving/scan-serial` answers `listing_serial_confirmed: true`
 * when the added serial matched one (trim + upper) and the server stamped
 * `confirmed_at`; {@link publishListingSerialConfirmed} mirrors that onto the
 * line optimistically so the reference and the As listed block flip at once.
 */

import type { QueryClient } from '@tanstack/react-query';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import { receivingSiblingsQueryKey, type ReceivingSiblingsCache } from '@/lib/queries/receiving-queries';
import type { ListingSerialRef, ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/** Stamp `confirmed_at` on the listing serial matching `serial` (trim + upper, the server's `serial_norm`); the same array back when none changed. */
function markListingSerialConfirmed(
  serials: ReadonlyArray<ListingSerialRef>,
  serial: string,
  confirmedAt: string,
): ReadonlyArray<ListingSerialRef> {
  const norm = serial.trim().toUpperCase();
  let changed = false;
  const next = serials.map((s) => {
    if (s.confirmed_at != null || s.serial.trim().toUpperCase() !== norm) return s;
    changed = true;
    return { ...s, confirmed_at: confirmedAt };
  });
  return changed ? next : serials;
}

/**
 * After a scan-serial response with `listing_serial_confirmed`, patch the
 * line's `listing_serials` through the shared `receiving-line-updated` bus
 * (siblings cache + open workspace row). `fallback` is the caller's own copy
 * of the line's listing serials when the siblings cache has not loaded it.
 */
export function publishListingSerialConfirmed(
  queryClient: QueryClient,
  receivingId: number | null | undefined,
  lineId: number,
  serial: string,
  fallback?: ReadonlyArray<ListingSerialRef> | null,
): void {
  const cached =
    receivingId != null
      ? queryClient
          .getQueryData<ReceivingSiblingsCache<ReceivingLineRow>>(receivingSiblingsQueryKey(receivingId))
          ?.receiving_lines?.find((l) => l.id === lineId)?.listing_serials
      : undefined;
  const current = cached ?? fallback;
  if (!current || current.length === 0) return;
  const next = markListingSerialConfirmed(current, serial, new Date().toISOString());
  if (next === current) return;
  dispatchUnboxRailLineUpdated({ id: lineId, listing_serials: [...next] });
}
