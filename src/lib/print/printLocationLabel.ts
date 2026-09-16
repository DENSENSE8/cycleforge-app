/**
 * Structured location (bin / rack) stickers on the shared 2×1" {@link printLabel}
 * face. Preview ({@link LabelFacePreview}) and print consume {@link locationLabelToFace}
 * so the warehouse builder cannot drift from Unbox / special-bin stock.
 *
 * Callers: LocationLabelFacePreview, useBinLabelPrinter, useRackLabelPrinter,
 * StationNewLocationForm, StationLocationsDisplay, LocationCrudDialog.
 * `roomName` stays on the args so those callers do not change; it is never
 * painted. User: remove "Zone 3 - Parts", eliminate the stray "C", drop
 * redundant "Lv 1", enlarge the primary identifier, no HRI under the matrix.
 *
 * The encoded identity is still `encodePrintMatrix({ kind: 'location' })` —
 * 2×1 is the paper, not a new barcode format. Batching (USB sequential vs one
 * multi-page iframe) is not this module's job: that is {@link printLabelFacesJob},
 * shared with the handling-unit tote run.
 */

import {
  locationCode,
  rackCode,
  type LocationSegments,
} from '@/lib/barcode-routing';
import type { LabelFaceModel } from '@/lib/print/labelFace';
import { printLabelFacesJob } from '@/lib/print/printLabelFacesJob';
import { encodePrintMatrix } from '@/lib/qr/platform-link';

export function locationLabelToFace(input: {
  segments: LocationSegments;
  roomName?: string | null;
  gln: string;
  orgSlug?: string | null;
}): LabelFaceModel {
  void input.roomName;
  const { segments } = input;
  const rack = segments.position === 0;
  const code = rack
    ? rackCode({
        zone: segments.zone,
        aisle: segments.aisle,
        bay: segments.bay,
        level: segments.level,
      })
    : locationCode(segments);
  const matrix = encodePrintMatrix({
    kind: 'location',
    segments,
    gln: input.gln,
    orgSlug: input.orgSlug,
  });
  return {
    kind: 'location',
    topLeft: '',
    topRight: '',
    center: code,
    bottomLeft: '',
    bottomRight: '',
    matrix: { value: matrix.value, symbology: matrix.symbology, scale: 4 },
  };
}

/** Print one or many unique location faces on 2×1 stock. */
export async function printLocationLabelsJob(input: {
  segments: readonly LocationSegments[];
  roomName: string;
  gln: string;
  orgSlug?: string | null;
  /** USB sequential only — StickyActionBar `Printing 12/47`. Iframe batch does not tick. */
  onProgress?: (done: number, total: number) => void;
}): Promise<'usb' | 'iframe' | 'skipped'> {
  const faces = input.segments.map((segments) =>
    locationLabelToFace({
      segments,
      roomName: input.roomName,
      gln: input.gln,
      orgSlug: input.orgSlug,
    }),
  );
  return printLabelFacesJob({
    faces,
    name: 'Location labels',
    faceName: (face) => `Location ${face.center}`.trim(),
    onProgress: input.onProgress,
  });
}
