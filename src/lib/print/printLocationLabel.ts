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
 * 2×1 is the paper, not a new barcode format.
 */

import {
  locationCode,
  rackCode,
  type LocationSegments,
} from '@/lib/barcode-routing';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
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

function faceToPrintOpts(face: LabelFaceModel) {
  return {
    name: `Location ${face.center}`.trim(),
    ...buildFaceInfoHtml(face),
    dataMatrix: face.matrix,
    hri: face.hri,
    face,
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
  if (typeof window === 'undefined') return 'skipped';
  const faces = input.segments.map((segments) =>
    locationLabelToFace({
      segments,
      roomName: input.roomName,
      gln: input.gln,
      orgSlug: input.orgSlug,
    }),
  );
  if (faces.length === 0 || !faces.every((f) => f.matrix.value.trim())) return 'skipped';

  const { printLabelJob, buildMultiPageLabelHtml } = await import('@/lib/print/printLabel');
  const { reserveLegacyPrintPopup, printHtmlInIframe } = await import('@/lib/print/iframePrint');
  const { isSilentPrintEnabled } = await import('@/lib/print/printMode');

  if (faces.length === 1) {
    return printLabelJob({
      ...faceToPrintOpts(faces[0]!),
      legacyPopup: reserveLegacyPrintPopup(),
    });
  }

  if (isSilentPrintEnabled()) {
    const { getProfileForRole } = await import('@/lib/print/browserPrint');
    const labelProfile = getProfileForRole('label');
    if (labelProfile && labelProfile.kind !== 'os' && labelProfile.language !== 'none') {
      const total = faces.length;
      input.onProgress?.(0, total);
      let usb = 0;
      for (const face of faces) {
        const result = await printLabelJob(faceToPrintOpts(face));
        if (result !== 'usb') break;
        usb += 1;
        input.onProgress?.(usb, total);
      }
      if (usb === faces.length) return 'usb';
    }
  }

  const html = buildMultiPageLabelHtml(faces.map((face) => faceToPrintOpts(face)));
  printHtmlInIframe(html, {
    name: 'Location labels',
    legacyPopup: reserveLegacyPrintPopup(),
  });
  return 'iframe';
}
