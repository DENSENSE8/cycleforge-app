import { getLast4 } from '@/components/ui/CopyChip';
import { receivingHandle, receivingLineHandle } from '@/lib/barcode-routing';
import { printLabel } from '@/lib/print/printLabel';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { conditionLabel } from '@/lib/conditions';

/**
 * As Listed disclosure sticker — seller-claimed condition / defects for
 * returns, trade-ins, and "sold as damaged" intake. Separate from the carton
 * LPN so downstream stations see the disclosure without opening the ticket.
 */
export interface AsListedLabelPayload {
  /** Free-text seller defect / listing disclosure (1–2 lines on the face). */
  disclosure: string;
  conditionCode: string;
  /** Platform or PO shorthand for the bottom-right corner. */
  corner: string;
  /** Optional date (top-right). */
  date?: string | null;
  /** Prefer line handle `L-{id}` when set; else carton `R-{id}`; else corner text. */
  receivingLineId?: number | null;
  receivingId?: number | null;
  /** Override the encoded matrix value. */
  qrValue?: string | null;
}

export function resolveAsListedQrValue(payload: AsListedLabelPayload): string {
  if (payload.qrValue && payload.qrValue.trim()) return payload.qrValue.trim();
  if (payload.receivingLineId != null && Number.isFinite(payload.receivingLineId)) {
    return receivingLineHandle(payload.receivingLineId);
  }
  if (payload.receivingId != null && Number.isFinite(payload.receivingId)) {
    return receivingHandle(payload.receivingId);
  }
  return (payload.corner || '').trim();
}

/**
 * Map an As Listed payload onto the shared {@link LabelFaceModel}.
 * Preview and print both consume this — they can't drift.
 */
export function asListedPayloadToFace(payload: AsListedLabelPayload): LabelFaceModel {
  const qrValue = resolveAsListedQrValue(payload);
  const hri = /^(?:L|R|RCV)-\d+$/i.test(qrValue) ? qrValue.toUpperCase() : undefined;
  const corner = (payload.corner || '').trim();
  return {
    kind: 'receiving',
    topLeft: 'AS LISTED',
    topRight: (payload.date || '').trim(),
    center: (payload.disclosure || '').trim(),
    bottomLeft: conditionLabel(payload.conditionCode, 'label'),
    bottomRight: corner.length > 8 ? getLast4(corner) : corner,
    matrix: { value: qrValue, symbology: 'datamatrix', scale: 4 },
    hri,
  };
}

export function printAsListedLabel(payload: AsListedLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = asListedPayloadToFace(payload);
  if (!face.matrix.value && !face.center) return;

  printLabel({
    name: 'As Listed',
    ...buildFaceInfoHtml(face),
    dataMatrix: face.matrix,
    hri: face.hri,
  });
}
