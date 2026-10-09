/** Flat-barcode 2×1" thermal labels — locations whose barcode is a bare code (`QA-SHELF-A01`, a station bench) rather than a structured zone/aisle/bay/level/position one, so the face prints the code itself beside its matrix. */

import type { LabelFaceModel } from '@/lib/print/labelFace';
import { printLabelFacesJob } from '@/lib/print/printLabelFacesJob';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';

/**
 * The 2×1 face for a flat-barcode location: matrix on the right, HRI = the
 * barcode, the row's name as the hero (else the code), its room bottom-left.
 */
export function flatLocationFace(input: {
  barcode: string;
  name?: string | null;
  room?: string | null;
  /** Top-left kicker. Defaults to `LOCATION`. */
  kicker?: string;
  /** Top-right badge. Defaults to none. */
  badge?: string;
}): LabelFaceModel {
  const barcode = input.barcode.trim();
  return {
    kind: 'receiving',
    topLeft: input.kicker ?? 'LOCATION',
    topRight: input.badge ?? '',
    center: (input.name ?? '').trim() || barcode,
    bottomLeft: (input.room ?? '').trim() || 'Warehouse',
    bottomRight: '',
    matrix: { value: barcode, symbology: 'datamatrix', scale: 4 },
    hri: barcode,
  };
}

/** Print a station bench's tag — the 2×1 face for a DESK / STAGING `locations` row (Settings → Stations). */
export function printStationTagFromRow(row: {
  barcode: string | null;
  name: string;
  displayName?: string | null;
  locationKind: string;
  room?: string | null;
}): boolean {
  const code = (row.barcode ?? '').trim();
  if (!code) return false;
  void printLabelFacesJob({
    faces: [
      flatLocationFace({
        barcode: code,
        kicker: 'STATION',
        badge: row.locationKind === 'STAGING' ? 'STAGING' : 'DESK',
        name: packBenchShortLabel({
          locationName: row.name,
          locationDisplayName: row.displayName,
          locationKind: row.locationKind,
        }),
        room: row.room,
      }),
    ],
    name: `Station ${code}`,
  });
  return true;
}
