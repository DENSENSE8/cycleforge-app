/**
 * The docs sheet's selection-wide answers (operator 2026-10-06, quality of
 * life): which order or tab is owed next, how many orders are complete, which
 * rows the rail shows, which other orders in the selection share a SKU that
 * just got its paperwork, and where Print will send what. Pure.
 */

import { isPacketGap, type OrderPacket, type OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { LabelPrintRoute, PrintStock } from '@/lib/label-prints/print-route';
import { paperworkSkuKey } from '@/lib/manuals/paperwork-pairing';
import { PRINT_STOCKS, type PressStation } from '@/features/labels-docs/desk-press';
import { CHANNEL_FACE } from '@/features/labels-docs/print-faces';
import { DOC_TABS, docTabState, type DocTab } from './doc-tabs';

export interface SheetPlace {
  orderId: number;
  tab: DocTab;
}

/**
 * The next order × tab still owed, walking the selection in rail order
 * (this order's later tabs, then the next orders, wrapping round); the
 * current place counts last. Null = the selection is complete.
 */
export function nextOwed(rows: readonly OrderPacket[], from: SheetPlace): SheetPlace | null {
  const places = rows.flatMap((packet) => DOC_TABS.map((tab) => ({ packet, tab })));
  if (places.length === 0) return null;
  const start = places.findIndex(({ packet, tab }) => packet.orderId === from.orderId && tab === from.tab);
  for (let step = 1; step <= places.length; step += 1) {
    const { packet, tab } = places[(start + step + places.length) % places.length]!;
    if (isPacketGap(docTabState(packet, tab))) return { orderId: packet.orderId, tab };
  }
  return null;
}

/** An order is complete when no tab of it is owed. */
export function isPacketComplete(packet: OrderPacket): boolean {
  return DOC_TABS.every((tab) => !isPacketGap(docTabState(packet, tab)));
}

/** The rail's filter: every order, orders owing anything, or orders owing one tab. */
export type RailFilter = 'all' | 'owed' | DocTab;

export function railRowsFor(rows: readonly OrderPacket[], filter: RailFilter): OrderPacket[] {
  if (filter === 'all') return [...rows];
  if (filter === 'owed') return rows.filter((packet) => !isPacketComplete(packet));
  return rows.filter((packet) => isPacketGap(docTabState(packet, filter)));
}

/**
 * Other orders of the selection with a line on the same SKU that still owes
 * paperwork and does not have `manualId` — the "also link" offer after one
 * manual is linked. One line per order (the first that matches).
 */
export function sameSkuOwing(
  rows: readonly OrderPacket[],
  orderId: number,
  line: Pick<OrderPacketLine, 'sku'>,
  manualId: number,
): Array<{ packet: OrderPacket; line: OrderPacketLine }> {
  const key = paperworkSkuKey(line.sku);
  if (!key) return [];
  return rows.flatMap((packet) => {
    if (packet.orderId === orderId) return [];
    const match = packet.lines.find(
      (each) => paperworkSkuKey(each.sku) === key && isPacketGap(each.state) && !each.documents.some((doc) => doc.manualId === manualId),
    );
    return match ? [{ packet, line: match }] : [];
  });
}

export interface PrintPreviewLine {
  stock: PrintStock;
  count: number;
  /** "12 label pages (4×6) → This computer · Zebra · Thermal · USB". */
  text: string;
  blocked: boolean;
}

/**
 * What Print will do, per stock, before it runs: how many, on what paper, to
 * which station (this computer names its printer and channel). Labels are one
 * page each; paperwork counts documents.
 */
export function printPreview(
  documents: readonly DeskDocument[],
  target: Record<PrintStock, PressStation | null>,
  blockedReason: (stock: PrintStock) => string | null,
  routes: Record<PrintStock, LabelPrintRoute> | null,
): PrintPreviewLine[] {
  return PRINT_STOCKS.flatMap((stock) => {
    const count = documents.filter((doc) => doc.stock === stock).length;
    if (count === 0) return [];
    const route = routes?.[stock] ?? null;
    const what =
      stock === 'label' ? `${count} label page${count === 1 ? '' : 's'}` : `${count} paperwork doc${count === 1 ? '' : 's'}`;
    const paper = route ? ` (${route.paper.label})` : '';
    const station = target[stock];
    if (!station || station.thisComputer) {
      const printer = route ? [route.printerName, CHANNEL_FACE[route.channel]].filter(Boolean).join(' · ') : null;
      return [{ stock, count, blocked: false, text: `${what}${paper} → This computer${printer ? ` · ${printer}` : ''}` }];
    }
    const reason = blockedReason(stock);
    return [{ stock, count, blocked: reason != null, text: `${what}${paper} → ${reason ? `not sent — ${reason}` : station.stationName}` }];
  });
}
