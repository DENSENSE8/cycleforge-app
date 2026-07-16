import { ticketHandle } from '@/lib/barcode-routing';
import { printLabel } from '@/lib/print/printLabel';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';

/**
 * Minimal ticket scan sticker — large `#ticket` face + DataMatrix carrying
 * `T-{providerTicketId}` (routeScan → `/support?ticket=…`).
 */
export interface TicketLabelPayload {
  /** Provider ticket digits (Zendesk id), no `#`. */
  ticketDigits: string;
  /** Optional SKU / PO shorthand for the top row. */
  context?: string | null;
  /** Optional platform for the bottom-right. */
  platform?: string | null;
  /** Override the encoded matrix value. */
  qrValue?: string | null;
}

export function resolveTicketQrValue(payload: TicketLabelPayload): string {
  if (payload.qrValue && payload.qrValue.trim()) return payload.qrValue.trim();
  const digits = String(payload.ticketDigits || '').replace(/\D/g, '');
  return digits ? ticketHandle(digits) : '';
}

export function ticketPayloadToFace(payload: TicketLabelPayload): LabelFaceModel {
  const digits = String(payload.ticketDigits || '').replace(/\D/g, '');
  const qrValue = resolveTicketQrValue(payload);
  const hri = /^T-\d+$/i.test(qrValue) ? qrValue.toUpperCase() : undefined;
  return {
    kind: 'receiving',
    topLeft: (payload.context || '').trim() || 'TICKET',
    topRight: '',
    center: digits ? `#${digits}` : '',
    bottomLeft: '',
    bottomRight: (payload.platform || '').trim(),
    matrix: { value: qrValue, symbology: 'datamatrix', scale: 4 },
    hri,
  };
}

export function printTicketLabel(payload: TicketLabelPayload): void {
  if (typeof window === 'undefined') return;
  const face = ticketPayloadToFace(payload);
  if (!face.matrix.value) return;

  printLabel({
    name: 'Ticket',
    ...buildFaceInfoHtml(face),
    dataMatrix: face.matrix,
    hri: face.hri,
  });
}
