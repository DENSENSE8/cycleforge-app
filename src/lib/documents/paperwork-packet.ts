/** Paperwork packets for the BROWSER print fallback — "the packer print station is down, print it from the desk". */

import type { OrgId } from '@/lib/tenancy/constants';
import { recordDocumentPrintJob, type DocumentPrintJobType } from './document-print-jobs';
import { resolvePrintBundle } from './print-bundle';

/** Upper bound on one request — a bulk run past this is split by the client. */
export const PAPERWORK_PACKET_MAX_ORDERS = 100;

export interface PaperworkPacketItem {
  kind: 'outbound' | 'manual';
  documentType: DocumentPrintJobType;
  /** Same-origin, session-authenticated content URL for the bytes. */
  src: string;
  documentId: number | null;
  productManualId: number | null;
  name: string | null;
}

export interface PaperworkPacket {
  orderId: number;
  items: PaperworkPacketItem[];
  /** Bundle types with nothing attached (label / slip) — the caller says so. */
  missingTypes: string[];
}

export interface PaperworkPacketDeps {
  resolve: (orgId: OrgId, orderId: number) => ReturnType<typeof resolvePrintBundle>;
  record: typeof recordDocumentPrintJob;
}

const defaultDeps: PaperworkPacketDeps = {
  resolve: (orgId, orderId) => resolvePrintBundle(orgId, { orderId }),
  record: recordDocumentPrintJob,
};

export async function buildPaperworkPackets(
  orgId: OrgId,
  input: { orderIds: readonly number[]; batchId: string; actorStaffId: number | null },
  deps: PaperworkPacketDeps = defaultDeps,
): Promise<PaperworkPacket[]> {
  const orderIds = [...new Set(input.orderIds.filter((id) => Number.isInteger(id) && id > 0))].slice(
    0,
    PAPERWORK_PACKET_MAX_ORDERS,
  );
  const packets: PaperworkPacket[] = [];

  for (const orderId of orderIds) {
    const resolved = await deps.resolve(orgId, orderId);
    const items: PaperworkPacketItem[] = [];

    for (const doc of resolved.documents) {
      items.push({
        kind: 'outbound',
        documentType: doc.documentType,
        src: `/api/documents/${doc.id}/content`,
        documentId: doc.id,
        productManualId: null,
        name: doc.data.filename ?? null,
      });
    }
    for (const manual of resolved.manuals) {
      const documentId = manual.documentId != null && manual.documentId > 0 ? manual.documentId : null;
      items.push({
        kind: 'manual',
        documentType: 'manual',
        src: documentId ? `/api/documents/${documentId}/content` : `/api/product-manuals/${manual.id}/content`,
        documentId,
        productManualId: manual.id,
        name: manual.displayName ?? null,
      });
    }

    // One ledger row per page source, keyed by the batch so a retried request
    // does not double-count what was sent to the browser once.
    for (const item of items) {
      const key = item.documentId != null ? `doc:${item.documentId}` : `manual:${item.productManualId}`;
      await deps.record(
        {
          orderId,
          documentId: item.documentId,
          productManualId: item.productManualId,
          documentType: item.documentType,
          status: 'fallback_browser',
          actorStaffId: input.actorStaffId,
          clientEventId: `desk-print:${input.batchId}:${orderId}:${key}`,
        },
        orgId,
      );
    }

    packets.push({ orderId, items, missingTypes: [...resolved.missingTypes] });
  }
  return packets;
}
