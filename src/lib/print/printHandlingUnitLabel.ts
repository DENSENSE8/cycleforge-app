import { handlingUnitHandle } from '@/lib/barcode-routing';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';

/**
 * 2×1" tote / tray license-plate. Same {@link LabelFaceModel} grid as special
 * bins and station commands — info column left, DataMatrix right, HRI under
 * the matrix. Do not fork a second type scale (the retired BOX / LPN face).
 *
 * Center is the human `H-{id}` code; the matrix encodes the same handle.
 */
export interface HandlingUnitLabelPayload {
  /** Numeric handling_units.id — used to build the H- handle + DataMatrix. */
  handlingUnitId: number;
  /** Stored code; defaults to `H-{id}` when omitted. Shown on the face center. */
  code?: string | null;
  /** Member count. Zero and empty stay off the sticker. */
  unitCount?: number | null;
  /** Optional bin/zone name where the tote lives. */
  locationName?: string | null;
  /** Ignored — a durable tote code does not carry the print day. */
  date?: string | null;
}

export function handlingUnitPayloadToFace(
  payload: HandlingUnitLabelPayload,
): LabelFaceModel {
  const handle = handlingUnitHandle(payload.handlingUnitId);
  const code = (payload.code && payload.code.trim()) || handle;
  const n = payload.unitCount;
  const count =
    n != null && Number.isFinite(n) && n > 0
      ? `${Math.floor(n)} ${Math.floor(n) === 1 ? 'unit' : 'units'}`
      : '';
  const loc = (payload.locationName || '').trim();
  return {
    kind: 'receiving',
    topLeft: 'Tote',
    topRight: '',
    center: code,
    bottomLeft: loc,
    bottomRight: count,
    matrix: { value: handle, symbology: 'datamatrix', scale: 4 },
    hri: handle,
  };
}

export async function printHandlingUnitLabelJob(
  payload: HandlingUnitLabelPayload,
): Promise<'usb' | 'iframe' | 'skipped'> {
  if (typeof window === 'undefined') return 'skipped';
  const face = handlingUnitPayloadToFace(payload);
  if (!face.matrix.value) return 'skipped';
  const legacyPopup = reserveLegacyPrintPopup();
  const { printLabelJob } = await import('@/lib/print/printLabel');
  return printLabelJob({
    name: 'Tote',
    ...buildFaceInfoHtml(face),
    dataMatrix: face.matrix,
    hri: face.hri,
    face,
    legacyPopup,
  });
}

export function printHandlingUnitLabel(payload: HandlingUnitLabelPayload): void {
  void printHandlingUnitLabelJob(payload);
}
