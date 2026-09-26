import { encodePrintMatrix, type PrintMatrix } from '@/lib/qr/platform-link';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { reserveLegacyPrintPopup } from '@/lib/print/iframePrint';

/**
 * Minimal ticket scan sticker — same corner grammar as the carton face
 * (platform top-left · `#ticket` bottom-right) + DataMatrix carrying
 * `T-{providerTicketId}` (routeScan → `/support?ticket=…`).
 */
export interface TicketLabelPayload {
  /** Provider ticket digits (Zendesk id), no `#`. */
  ticketDigits: string;
  /**
   * Optional SKU / PO shorthand. Kept for callers; not painted on the face
   * (corners are platform · `#ticket` only).
   */
  context?: string | null;
  /** Optional platform for the top-left. */
  platform?: string | null;
  /**
   * Tenant slug, carried for the encode SoT. Unused today — a ticket resolves
   * to `/support?ticket=`, which is staff-only, so there is nothing for an
   * anonymous phone to land on and the bare `T-` handle stays correct.
   */
  orgSlug?: string | null;
  /** Override the encoded matrix value. */
  qrValue?: string | null;
}

/** Ticket matrix via the encode SoT ({@link encodePrintMatrix}). */
function ticketLabelMatrix(payload: TicketLabelPayload): PrintMatrix {
  return encodePrintMatrix({
    kind: 'ticket',
    orgSlug: payload.orgSlug,
    ticketDigits: payload.ticketDigits,
    override: payload.qrValue,
  });
}

export function resolveTicketQrValue(payload: TicketLabelPayload): string {
  return ticketLabelMatrix(payload).value;
}

export function ticketPayloadToFace(payload: TicketLabelPayload): LabelFaceModel {
  const digits = String(payload.ticketDigits || '').replace(/\D/g, '');
  const { value, symbology, hri } = ticketLabelMatrix(payload);
  return {
    kind: 'receiving',
    topLeft: (payload.platform || '').trim(),
    topRight: '',
    center: '',
    bottomLeft: '',
    bottomRight: digits ? `#${digits}` : '',
    matrix: { value, symbology, scale: 4 },
    hri,
  };
}

export function printTicketLabel(payload: TicketLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = ticketPayloadToFace(payload);
  if (!face.matrix.value) return;

  const legacyPopup = reserveLegacyPrintPopup();
  // Lazy: printLabel drags the bwip-js barcode engine; load on the actual print.
  void import('@/lib/print/printLabel').then(({ printLabel }) => {
    printLabel({
      name: 'Ticket',
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
      legacyPopup,
    });
  });
}
