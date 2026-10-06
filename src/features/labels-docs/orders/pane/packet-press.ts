/**
 * One order's printable documents for the desk press (`useDeskPress` →
 * `planPress`): its shipping labels (stock `label`) then its packing slips and
 * product paperwork (stock `paper`), in pack order. One physical document is
 * one entry — a manual that resolves for two lines prints once. Pure, so the
 * pane's Print order and the list's ⌘/Ctrl+P share it.
 */

import { getLast8 } from '@/lib/copy-chip-format';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { reprintWarning, type PrintedLabelFace } from '../../use-desk-press';

/** A held label (quarantined or failed) is not printed until it is confirmed onto the order. */
const HELD_LABEL_STATES: Readonly<Record<string, true>> = { QUARANTINED: true, FAILED: true };

/** "Item # 1234" / "SKU AB-1" / "Order 100621" — what a paperwork document is pinned by. */
export function paperworkSourceFace(
  association: { source: 'order' | 'item_number' | 'sku'; itemNumber: string | null; sku: string | null },
  orderRef: string,
): string {
  if (association.source === 'item_number' && association.itemNumber) return `Item # ${association.itemNumber}`;
  if (association.source === 'sku' && association.sku) return `SKU ${association.sku}`;
  return `Order ${orderRef}`;
}

/** Every printable document of the order, labels first; each carries what the reprint warning names. */
function packetFaces(packet: OrderPacket): Array<{ doc: DeskDocument; face: PrintedLabelFace }> {
  const orderLabel = `Order ${packet.orderRef}`;
  const several = packet.label.labels.length + packet.label.documents.length > 1;
  const out: Array<{ doc: DeskDocument; face: PrintedLabelFace }> = [];

  for (const row of packet.label.labels) {
    if (HELD_LABEL_STATES[row.state]) continue;
    const base = row.carrier ? `${row.carrier} label` : 'Shipping label';
    const title = several && row.trackingNumber ? `${base} · ${getLast8(row.trackingNumber)}` : base;
    out.push({
      doc: {
        key: `label:${row.id}`,
        kind: 'label',
        title,
        associationLabel: orderLabel,
        src: labelPdfSrc(row.id),
        stock: 'label',
        ingestionId: row.id,
        orderId: packet.orderId,
        documentId: null,
        manualId: null,
      },
      face: { name: `${orderLabel}’s label`, printCount: row.printCount, lastPrintedAt: row.lastPrintedAt, lastPrintedBy: row.lastPrintedBy, lastStationName: row.lastStationName },
    });
  }
  for (const label of packet.label.documents) {
    out.push({
      doc: {
        key: label.key,
        kind: 'label',
        title: label.title,
        associationLabel: orderLabel,
        src: label.src,
        stock: 'label',
        ingestionId: null,
        orderId: packet.orderId,
        documentId: label.documentId,
        manualId: null,
      },
      face: { name: label.title, printCount: label.printCount, lastPrintedAt: label.lastPrintedAt, lastPrintedBy: null, lastStationName: null },
    });
  }

  const seen = new Set<string>();
  const paperwork = [...packet.slip.documents, ...packet.lines.flatMap((line) => line.documents)];
  for (const doc of paperwork) {
    if (!doc.src || seen.has(doc.key)) continue;
    seen.add(doc.key);
    out.push({
      doc: {
        key: doc.key,
        kind: doc.kind,
        title: doc.title,
        associationLabel: doc.kind === 'packing_slip' ? orderLabel : paperworkSourceFace(doc.association, packet.orderRef),
        src: doc.src,
        stock: 'paper',
        ingestionId: null,
        orderId: packet.orderId,
        documentId: doc.documentId,
        manualId: doc.manualId,
      },
      face: { name: doc.title, printCount: doc.printCount, lastPrintedAt: doc.lastPrintedAt, lastPrintedBy: null, lastStationName: null },
    });
  }
  return out;
}

export function packetDocuments(packet: OrderPacket): DeskDocument[] {
  return packetFaces(packet).map((entry) => entry.doc);
}

/** The reprint question for printing these orders, or null when nothing in them was printed before. */
export function packetReprintWarning(packets: readonly OrderPacket[]): string | null {
  return reprintWarning(packets.flatMap((packet) => packetFaces(packet).map((entry) => entry.face)));
}
