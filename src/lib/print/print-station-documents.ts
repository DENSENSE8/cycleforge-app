/**
 * Desk documents ↔ the station `documents` wire. The sender sends ids only;
 * the station rebuilds every same-origin bytes URL from those ids and never
 * prints a URL it was handed.
 */
import { documentContentUrl } from '@/lib/documents/display-url';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { StaffPrintDocumentsPayload, StationDocumentRef } from './staff-print-bridge';

/** The wire ref of one desk document; null for a document with no id to print by. */
export function stationDocumentRef(doc: DeskDocument): StationDocumentRef | null {
  const base = { kind: doc.kind, orderId: doc.orderId, title: doc.title };
  if (doc.kind === 'label') return doc.ingestionId == null ? null : { ...base, ingestionId: doc.ingestionId };
  if (doc.kind === 'packing_slip') return doc.documentId == null ? null : { ...base, documentId: doc.documentId };
  return doc.manualId == null ? null : { ...base, manualId: doc.manualId };
}

/** The station side: one printable desk document per ref, bytes from this origin. */
export function deskDocumentsFromStation(payload: StaffPrintDocumentsPayload): DeskDocument[] {
  const docs: DeskDocument[] = [];
  for (const ref of payload.items) {
    const common = { kind: ref.kind, title: ref.title, stock: payload.stock, orderId: ref.orderId };
    if (ref.kind === 'label' && ref.ingestionId != null) {
      docs.push({
        ...common,
        key: `label:${ref.ingestionId}`,
        src: labelPdfSrc(ref.ingestionId),
        ingestionId: ref.ingestionId,
        documentId: null,
        manualId: null,
      });
    } else if (ref.kind === 'packing_slip' && ref.documentId != null) {
      docs.push({
        ...common,
        key: `doc:${ref.documentId}`,
        src: documentContentUrl(ref.documentId),
        ingestionId: null,
        documentId: ref.documentId,
        manualId: null,
      });
    } else if (ref.kind === 'manual' && ref.manualId != null) {
      docs.push({
        ...common,
        key: `manual:${ref.manualId}`,
        src: productManualContentPath(ref.manualId),
        ingestionId: null,
        documentId: null,
        manualId: ref.manualId,
      });
    }
  }
  return docs;
}
