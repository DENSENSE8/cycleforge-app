/**
 * The Live feed bulk bar's domain facts — which verbs a selection may take
 * and how a label run or a scan-out run is planned. Every write rides an existing path:
 * Assign picker → `POST /api/orders/assign` (via `useOrderAssignment`),
 * Print labels → `GET /api/orders/[id]/documents` + `printOutboundDocuments`
 * (Allocate's "Print shipping labels"), Scan out → `POST /api/shipped/scan-out`
 * (`postScanOut`, the dock's own writer — it still refuses a cancelled box).
 * Client-safe.
 */

import type { OutboundDocument, OutboundDocumentsResponse } from '@/lib/documents/types';
import { isPdfOutboundDocument } from '@/lib/documents/outbound-document-display';
import type { PrintableOutboundDocument } from '@/lib/print/printOutboundDocuments';
import type { PackageCard } from '@/lib/live-feed/types';
import type { PackageStage } from '@/lib/live-feed/stages';
import type { ScanOutResult } from '@/lib/outbound/scan-out-client';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Distinct `orders.id`s of the selection, in selection order. */
export function selectedOrderRowIds(cards: readonly Pick<PackageCard, 'orderRowId'>[]): number[] {
  return [...new Set(cards.map((card) => card.orderRowId))];
}

/**
 * Every selected package sits in `stage` — a stage-bound verb shows only then:
 * Assign picker on To pick, Scan out on Packed.
 */
export function selectionInStage(cards: readonly Pick<PackageCard, 'stage'>[], stage: PackageStage): boolean {
  return cards.length > 0 && cards.every((card) => card.stage === stage);
}

export interface ScanOutPlan {
  /** One label per box — box mates share a shipment, and a box leaves once. */
  labels: string[];
  /** Selected packages with no tracking on file. */
  unlabeled: number;
}

export function planScanOut(cards: readonly Pick<PackageCard, 'shipmentId' | 'tracking'>[]): ScanOutPlan {
  const seen = new Set<string>();
  const labels: string[] = [];
  let unlabeled = 0;
  for (const card of cards) {
    const tracking = card.tracking?.trim();
    if (!tracking) {
      unlabeled += 1;
      continue;
    }
    const box = card.shipmentId != null ? `s:${card.shipmentId}` : `t:${tracking}`;
    if (seen.has(box)) continue;
    seen.add(box);
    labels.push(tracking);
  }
  return { labels, unlabeled };
}

/** The toast for a finished run; `null` results are labels whose request failed. */
export function describeScanOut(
  results: readonly (ScanOutResult | null)[],
  unlabeled: number,
): { ok: boolean; message: string } {
  let sent = 0;
  let already = 0;
  let refused = 0;
  let failed = 0;
  for (const result of results) {
    if (result == null) failed += 1;
    else if (result.blocked || result.matched === false) refused += 1;
    else if (result.duplicate) already += 1;
    else sent += 1;
  }
  const notes: string[] = [];
  if (already > 0) notes.push(`${plural(already, 'box', 'boxes')} already scanned out`);
  if (refused > 0) notes.push(`${plural(refused, 'box', 'boxes')} refused — not packed or cancelled`);
  if (failed > 0) notes.push(`${plural(failed, 'box', 'boxes')} failed — retry`);
  if (unlabeled > 0) notes.push(`${plural(unlabeled, 'package')} skipped — no label`);
  const tail = notes.join(' · ');
  if (sent === 0) return { ok: false, message: tail || 'Nothing to scan out' };
  return { ok: true, message: `Scanned out ${plural(sent, 'box', 'boxes')}${tail ? ` · ${tail}` : ''}` };
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
