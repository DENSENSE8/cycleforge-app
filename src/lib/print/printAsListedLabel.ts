import { getLast8 } from '@/components/ui/CopyChip';
import { encodePrintMatrix, type PrintMatrix } from '@/lib/qr/platform-link';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';
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
  /**
   * Tenant slug, carried for the encode SoT. Unused today — `/m/l/*` is a proxy
   * REWRITE onto a staff page, so it has no anonymous landing and minting a URL
   * would send a consumer phone to `/signin`. The moment that path gets a
   * dual-audience landing, this is already threaded.
   */
  orgSlug?: string | null;
  /** Override the encoded matrix value. */
  qrValue?: string | null;
}

/** As-Listed matrix via the encode SoT ({@link encodePrintMatrix}). */
export function asListedLabelMatrix(payload: AsListedLabelPayload): PrintMatrix {
  return encodePrintMatrix({
    kind: 'as_listed',
    orgSlug: payload.orgSlug,
    receivingLineId: payload.receivingLineId,
    receivingId: payload.receivingId,
    override: payload.qrValue,
    fallbackValue: payload.corner,
  });
}

export function resolveAsListedQrValue(payload: AsListedLabelPayload): string {
  return asListedLabelMatrix(payload).value;
}

/**
 * Map an As Listed payload onto the shared {@link LabelFaceModel}.
 * Preview and print both consume this — they can't drift.
 */
export function asListedPayloadToFace(payload: AsListedLabelPayload): LabelFaceModel {
  const { value, symbology, hri } = asListedLabelMatrix(payload);
  const corner = (payload.corner || '').trim();
  return {
    kind: 'receiving',
    topLeft: 'AS LISTED',
    topRight: (payload.date || '').trim(),
    center: (payload.disclosure || '').trim(),
    bottomLeft: conditionLabel(payload.conditionCode, 'label'),
    bottomRight: corner.length > 8 ? getLast8(corner) : corner,
    matrix: { value, symbology, scale: 4 },
    hri,
  };
}

export function printAsListedLabel(payload: AsListedLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = asListedPayloadToFace(payload);
  if (!face.matrix.value && !face.center) return;

  const legacyPopup = reserveLegacyPrintPopup();
  // Lazy: printLabel drags the bwip-js barcode engine; load on the actual print.
  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: 'As Listed',
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
      legacyPopup,
    });
  });
}
