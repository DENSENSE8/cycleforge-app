/**
 * The docs sheet's selection — the one thing the right-hand viewer shows
 * (operator 2026-10-06: the viewer shows whatever is selected — a linked
 * document, or a library document BEFORE it is linked).
 *
 * A selection names its document by identity only; it is resolved against
 * the order's current packet on every render, so a write that changes the
 * packet moves the viewer with it:
 *
 *   linked → gone       (unpaired, unlinked, removed) → the tab's first linked document, else empty
 *   preview → linked    (Link on the viewer)           → the same manual, now as a linked document
 *
 * Pure: the sheet, the work column, the viewer and the tests all read these.
 */

import type { LabelPrintRow, PaperworkDocumentRow } from '@/lib/label-prints/contracts';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import type { OrderPacket, OrderPacketLine, PacketLabelDocument } from '@/lib/label-prints/order-packet-contracts';
import type { PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import type { DocTab } from './doc-tabs';

/** A library document offered for a line — a ranked suggestion or a search result — not linked to it. */
export interface PreviewManual {
  manualId: number;
  title: string;
  /** Same-origin bytes; null = no stored file (Drive-only, or never uploaded). */
  src: string | null;
  /** Google preview of a Drive-only manual. */
  driveUrl: string | null;
  /** Why it is offered: "matches 360148-0010", "SKU 00822 · manual". */
  detail: string | null;
  origin: 'suggestion' | 'search';
}

/** What the operator picked — identity only. */
export type DocSelection =
  | { kind: 'label'; ingestionId: number }
  | { kind: 'label-document'; documentId: number }
  | { kind: 'slip'; key: string }
  | { kind: 'paperwork'; lineId: number; key: string }
  | { kind: 'preview'; lineId: number; manual: PreviewManual };

/** A selection resolved against the packet — what the viewer paints and which verbs it offers. */
export type ViewerItem =
  | { kind: 'label'; key: string; title: string; src: string; row: LabelPrintRow; filed: boolean }
  | { kind: 'label-document'; key: string; title: string; src: string; doc: PacketLabelDocument }
  | { kind: 'slip'; key: string; title: string; src: string | null; doc: PaperworkDocumentRow }
  | { kind: 'paperwork'; key: string; title: string; src: string | null; doc: PaperworkDocumentRow; line: OrderPacketLine }
  | { kind: 'preview'; key: string; title: string; src: string | null; manual: PreviewManual; line: OrderPacketLine };

/** Something on file for the order. */
export type LinkedItem = Exclude<ViewerItem, { kind: 'preview' }>;

/** The tab each kind of selection lives on. */
export const SELECTION_TAB: Readonly<Record<DocSelection['kind'], DocTab>> = {
  label: 'label',
  'label-document': 'label',
  slip: 'slip',
  paperwork: 'paperwork',
  preview: 'paperwork',
};

/** An ingestion that is filed on the order (applied) — it unpairs; a held one is filed. */
export const isFiledLabel = (row: Pick<LabelPrintRow, 'state'>): boolean => row.state === 'APPLIED' || row.state === 'LINKED';

const paperworkItem = (line: OrderPacketLine, doc: PaperworkDocumentRow): LinkedItem => ({
  kind: 'paperwork',
  key: `${line.orderLineId}:${doc.key}`,
  title: doc.title,
  src: doc.src,
  doc,
  line,
});

/** Everything on file in the tab, in the order the work column lists it (paperwork: per line, line order). */
export function linkedItems(packet: OrderPacket, tab: DocTab): LinkedItem[] {
  if (tab === 'label') {
    const boxes = packet.label.labels.length + packet.label.documents.length;
    const box = (index: number) => (boxes > 1 ? `Box ${index + 1} · ` : '');
    return [
      ...packet.label.labels.map(
        (row, index): LinkedItem => ({
          kind: 'label',
          key: `label:${row.id}`,
          title: `${box(index)}${row.carrier ? `${row.carrier} label` : 'Shipping label'}`,
          src: labelPdfSrc(row.id),
          row,
          filed: isFiledLabel(row),
        }),
      ),
      ...packet.label.documents.map(
        (doc, index): LinkedItem => ({
          kind: 'label-document',
          key: doc.key,
          title: `${box(packet.label.labels.length + index)}${doc.title}`,
          src: doc.src,
          doc,
        }),
      ),
    ];
  }
  if (tab === 'slip') {
    return packet.slip.documents.map((doc): LinkedItem => ({ kind: 'slip', key: doc.key, title: doc.title, src: doc.src, doc }));
  }
  return packet.lines.flatMap((line) => line.documents.map((doc) => paperworkItem(line, doc)));
}

/** The selection that shows `item`. */
export function selectionOf(item: ViewerItem): DocSelection {
  switch (item.kind) {
    case 'label':
      return { kind: 'label', ingestionId: item.row.id };
    case 'label-document':
      return { kind: 'label-document', documentId: item.doc.documentId };
    case 'slip':
      return { kind: 'slip', key: item.doc.key };
    case 'paperwork':
      return { kind: 'paperwork', lineId: item.line.orderLineId, key: item.doc.key };
    case 'preview':
      return { kind: 'preview', lineId: item.line.orderLineId, manual: item.manual };
  }
}

function matches(item: LinkedItem, selection: Exclude<DocSelection, { kind: 'preview' }>): boolean {
  switch (selection.kind) {
    case 'label':
      return item.kind === 'label' && item.row.id === selection.ingestionId;
    case 'label-document':
      return item.kind === 'label-document' && item.doc.documentId === selection.documentId;
    case 'slip':
      return item.kind === 'slip' && item.doc.key === selection.key;
    case 'paperwork':
      return item.kind === 'paperwork' && item.line.orderLineId === selection.lineId && item.doc.key === selection.key;
  }
}

/**
 * What the viewer shows on `tab`: the selection when it still exists there,
 * a previewed manual as linked once it is, else the tab's first document on
 * file, else nothing (the viewer's empty state).
 */
export function resolveSelection(packet: OrderPacket, tab: DocTab, selection: DocSelection | null): ViewerItem | null {
  const linked = linkedItems(packet, tab);
  const fallback = linked[0] ?? null;
  if (!selection || SELECTION_TAB[selection.kind] !== tab) return fallback;
  if (selection.kind === 'preview') {
    const line = packet.lines.find((each) => each.orderLineId === selection.lineId);
    if (!line) return fallback;
    const doc = line.documents.find((each) => each.manualId === selection.manual.manualId);
    if (doc) return paperworkItem(line, doc);
    return {
      kind: 'preview',
      key: `preview:${line.orderLineId}:${selection.manual.manualId}`,
      title: selection.manual.title,
      src: selection.manual.src,
      manual: selection.manual,
      line,
    };
  }
  return linked.find((item) => matches(item, selection)) ?? fallback;
}

/** Is `manualId` the manual being previewed for `lineId`? (A suggestion or result row's pressed state.) */
export function isPreviewing(item: ViewerItem | null, lineId: number, manualId: number): boolean {
  return item?.kind === 'preview' && item.line.orderLineId === lineId && item.manual.manualId === manualId;
}

const openOrders = (n: number) => `${n} open order${n === 1 ? '' : 's'}`;

/** The viewer's Link verb, naming how far it reaches: "Link to SKU 00822 · 3 open orders". */
export function linkVerbLabel(scope: PaperworkSource, line: Pick<OrderPacketLine, 'sku' | 'itemNumber'>, reach: number | null): string {
  if (scope === 'sku') return `Link to SKU ${line.sku ?? ''}${reach != null ? ` · ${reach} open order${reach === 1 ? '' : 's'}` : ''}`;
  if (scope === 'item_number') return `Link to Item # ${line.itemNumber ?? ''}`;
  return 'Link to this order';
}
