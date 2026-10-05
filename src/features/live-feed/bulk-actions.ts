/**
 * The Live feed bulk bar's domain facts — which verbs a selection may take
 * and how a label run is planned. Every write rides an existing path:
 * Assign picker → `POST /api/orders/assign` (via `useOrderAssignment`),
 * Print labels → `GET /api/orders/[id]/documents` + `printOutboundDocuments`
 * (Allocate's "Print shipping labels"). Client-safe.
 */

import type { OutboundDocument, OutboundDocumentsResponse } from '@/lib/documents/types';
import { isPdfOutboundDocument } from '@/lib/documents/outbound-document-display';
import type { PrintableOutboundDocument } from '@/lib/print/printOutboundDocuments';
import type { PackageCard } from '@/lib/live-feed/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Distinct `orders.id`s of the selection, in selection order. */
export function selectedOrderRowIds(cards: readonly Pick<PackageCard, 'orderRowId'>[]): number[] {
  return [...new Set(cards.map((card) => card.orderRowId))];
}

/** Assign picker is offered only when every selected package is still To pick. */
export function canAssignPicker(cards: readonly Pick<PackageCard, 'stage'>[]): boolean {
  return cards.length > 0 && cards.every((card) => card.stage === 'to_pick');
}

/** One order's label read: its shipping-label documents, or `null` when the read failed. */
export interface OrderLabelRead {
  orderRowId: number;
  labels: readonly OutboundDocument[] | null;
}

export interface LabelPrintPlan {
  /** One page per distinct label document — orders that share a box share its label. */
  docs: PrintableOutboundDocument[];
  /** Selected orders that contributed a label. */
  printedOrders: number;
  /** Selected orders with no shipping label on file (no label bought yet). */
  skippedNoLabel: number;
  /** Selected orders whose documents could not be read. */
  unreachable: number;
}

export function planLabelPrint(reads: readonly OrderLabelRead[]): LabelPrintPlan {
  const seen = new Set<number>();
  const docs: PrintableOutboundDocument[] = [];
  let printedOrders = 0;
  let skippedNoLabel = 0;
  let unreachable = 0;
  for (const read of reads) {
    if (read.labels == null) {
      unreachable += 1;
      continue;
    }
    if (read.labels.length === 0) {
      skippedNoLabel += 1;
      continue;
    }
    printedOrders += 1;
    for (const label of read.labels) {
      if (seen.has(label.id)) continue;
      seen.add(label.id);
      docs.push({ id: label.id, isPdf: isPdfOutboundDocument(label) });
    }
  }
  return { docs, printedOrders, skippedNoLabel, unreachable };
}

/** The toast for a planned run: `ok` false when nothing printed. */
export function describeLabelPrint(plan: LabelPrintPlan): { ok: boolean; message: string } {
  const notes: string[] = [];
  if (plan.skippedNoLabel > 0) notes.push(`${plural(plan.skippedNoLabel, 'order')} skipped — no label bought`);
  if (plan.unreachable > 0) notes.push(`${plural(plan.unreachable, 'order')} could not be read`);
  const tail = notes.length > 0 ? ` · ${notes.join(' · ')}` : '';
  if (plan.docs.length === 0) {
    if (plan.skippedNoLabel === 0) {
      return { ok: false, message: 'Could not read the shipping documents — retry in a moment' };
    }
    return { ok: false, message: `No shipping labels on the selected packages${tail}` };
  }
  return {
    ok: true,
    message: `Printing ${plural(plan.docs.length, 'label')} for ${plural(plan.printedOrders, 'order')}${tail}`,
  };
}

/** Each order degrades on its own — one unreachable document never costs the whole run. */
export async function readShippingLabels(orderRowIds: readonly number[]): Promise<OrderLabelRead[]> {
  const settled = await Promise.allSettled(
    orderRowIds.map(async (orderRowId) => {
      const res = await fetch(`/api/orders/${orderRowId}/documents`);
      if (!res.ok) throw new Error(`documents ${orderRowId}`);
      const data = (await res.json()) as OutboundDocumentsResponse;
      return (data.documents ?? []).filter((doc) => doc.documentType === 'shipping_label');
    }),
  );
  return settled.map((result, index) => ({
    orderRowId: orderRowIds[index],
    labels: result.status === 'fulfilled' ? result.value : null,
  }));
}
