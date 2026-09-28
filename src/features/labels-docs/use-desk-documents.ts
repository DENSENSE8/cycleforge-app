'use client';

/**
 * What the open card puts on the desk — ONLY the view's own stock (owner
 * 2026-09-27: a view is a print job):
 *
 *   Labels     the order's stored labels (one box or several; or one unpaired label)
 *   Paperwork  the order's packing slips + manuals (from the queue read itself)
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
import { useOrderDocuments, useOrderManuals } from '@/lib/orders/order-paperwork-client';
import { labelDocuments, paperworkDocuments, type DeskCardModel } from './desk-rows';

export interface DeskDocumentsState {
  documents: DeskDocument[];
  /** Manuals the order resolves that only live on Drive — shown, never printed. */
  unprintable: Array<{ key: string; title: string }>;
  /** Labels view only: the open order's slips + manuals, for "Print order". */
  orderPaperwork: DeskDocument[];
  loading: boolean;
  error: string | null;
}

export function useDeskDocuments(model: DeskCardModel | null, view: LabelPrintView): DeskDocumentsState {
  // The live per-order read runs only for the open card on Labels (one order, never a list).
  const liveOrderId = view === 'labels' && model?.lead.orderId != null ? model.lead.orderId : 0;
  const slips = useOrderDocuments(liveOrderId);
  const manuals = useOrderManuals(liveOrderId);

  return useMemo(() => {
    if (!model) return { documents: [], unprintable: [], orderPaperwork: [], loading: false, error: null };
    const labels = view === 'paperwork' ? [] : labelDocuments(model.labels);
    const paper = view === 'labels' ? { documents: [], unprintable: [] } : paperworkDocuments(model.paperwork);

    const orderPaperwork: DeskDocument[] = [];
    if (liveOrderId) {
      for (const doc of slips.data?.documents ?? []) {
        if (doc.documentType !== 'packing_slip') continue;
        orderPaperwork.push({
          key: `doc:${doc.id}`,
          kind: 'packing_slip',
          title: doc.data.filename ? `Packing slip · ${doc.data.filename}` : 'Packing slip',
          src: `/api/documents/${doc.id}/content`,
          stock: 'paper',
          ingestionId: null,
          orderId: liveOrderId,
          documentId: doc.id,
          manualId: null,
        });
      }
      for (const manual of manuals.data?.manuals ?? []) {
        if (!manual.contentUrl) continue;
        orderPaperwork.push({
          key: `manual:${manual.id}`,
          kind: 'manual',
          title: manual.displayName,
          src: manual.contentUrl,
          stock: 'paper',
          ingestionId: null,
          orderId: liveOrderId,
          documentId: null,
          manualId: manual.id,
        });
      }
    }
    const failure = liveOrderId ? (slips.error ?? manuals.error) : null;
    return {
      documents: [...labels, ...paper.documents],
      unprintable: paper.unprintable,
      orderPaperwork,
      loading: liveOrderId !== 0 && (slips.isPending || manuals.isPending),
      error: failure ? failure.message : null,
    };
  }, [model, view, liveOrderId, slips.data, slips.isPending, slips.error, manuals.data, manuals.isPending, manuals.error]);
}
