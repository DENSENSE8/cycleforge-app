'use client';

/**
 * What the open card puts on the desk — ONLY the view's own stock (owner
 * 2026-09-27: a view is a print job):
 *
 *   Labels     every label, slip and manual linked to the selected Allocate order
 *   Paperwork  every label, slip and manual linked to the selected Allocate order
 *   Printed    both — a reprint splits by station like any press
 *
 * `orderPaperwork` is the order's paperwork read live for the open card on
 * Labels — only the explicit "Print order (labels + paperwork)" verb takes it.
 * A Drive-only manual (no stored bytes) cannot be rastered, so it is listed
 * as not printable.
 */

import { useMemo } from 'react';
import type { LabelPrintView } from '@/lib/label-prints/contracts';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { OutboundDocument } from '@/lib/documents/types';
import { useOrderDocuments, useOrderManuals } from '@/lib/orders/order-paperwork-client';
import { labelDocuments, type DeskCardModel } from './desk-rows';

export interface DeskDocumentsState {
  documents: DeskDocument[];
  /** Raw document rows behind doc:* faces; mutations preserve these ids/links. */
  linkedDocuments: OutboundDocument[];
  /** Manuals the order resolves that only live on Drive — shown, never printed. */
  unprintable: Array<{ key: string; title: string; associationLabel: string }>;
  /** Labels view only: the open order's slips + manuals, for "Print order". */
  orderPaperwork: DeskDocument[];
  loading: boolean;
  error: string | null;
}

export function useDeskDocuments(model: DeskCardModel | null, view: LabelPrintView): DeskDocumentsState {
  // Both order-tied views use the same live per-order file. The selected order,
  // not a print-queue snapshot, owns the document strip.
  const liveOrderId = view !== 'printed' && model?.lead.orderId != null ? model.lead.orderId : 0;
  const slips = useOrderDocuments(liveOrderId);
  const manuals = useOrderManuals(liveOrderId);

  return useMemo(() => {
    if (!model) return { documents: [], linkedDocuments: [], unprintable: [], orderPaperwork: [], loading: false, error: null };
    const documents: DeskDocument[] = liveOrderId ? labelDocuments(model.labels) : [];
    const unprintable: DeskDocumentsState['unprintable'] = [];
    const orderPaperwork: DeskDocument[] = [];
    if (liveOrderId) {
      for (const doc of slips.data?.documents ?? []) {
        const filename = doc.data.filename ?? doc.data.fileBasename;
        const mapped: DeskDocument = {
          key: `doc:${doc.id}`,
          kind: doc.documentType === 'shipping_label' ? 'label' : 'packing_slip',
          title: filename
            ? `${doc.documentType === 'shipping_label' ? 'Shipping label' : 'Packing slip'} · ${filename}`
            : doc.documentType === 'shipping_label' ? 'Shipping label' : 'Packing slip',
          associationLabel: `Order ${model.orderRef ?? liveOrderId}`,
          src: `/api/documents/${doc.id}/content`,
          stock: doc.documentType === 'shipping_label' ? 'label' : 'paper',
          ingestionId: null,
          orderId: liveOrderId,
          documentId: doc.id,
          manualId: null,
        };
        documents.push(mapped);
        if (mapped.stock === 'paper') orderPaperwork.push(mapped);
      }
      for (const manual of manuals.data?.manuals ?? []) {
        const associationLabel = manual.source === 'item_number' && manual.pairing.itemNumber
          ? `Item # ${manual.pairing.itemNumber}`
          : manual.source === 'sku' && manual.pairing.sku
            ? `SKU ${manual.pairing.sku}`
            : `Order ${model.orderRef ?? liveOrderId}`;
        if (!manual.contentUrl) {
          unprintable.push({ key: `manual:${manual.id}`, title: manual.displayName, associationLabel });
          continue;
        }
        const mapped: DeskDocument = {
          key: `manual:${manual.id}`,
          kind: 'manual',
          title: manual.displayName,
          associationLabel,
          src: manual.contentUrl,
          stock: 'paper',
          ingestionId: null,
          orderId: liveOrderId,
          documentId: null,
          manualId: manual.id,
        };
        documents.push(mapped);
        orderPaperwork.push(mapped);
      }
    }
    const failure = liveOrderId ? (slips.error ?? manuals.error) : null;
    return {
      documents,
      linkedDocuments: slips.data?.documents ?? [],
      unprintable,
      orderPaperwork,
      loading: liveOrderId !== 0 && (slips.isPending || manuals.isPending),
      error: failure ? failure.message : null,
    };
  }, [model, view, liveOrderId, slips.data, slips.isPending, slips.error, manuals.data, manuals.isPending, manuals.error]);
}
