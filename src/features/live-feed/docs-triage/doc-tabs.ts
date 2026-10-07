/**
 * The docs popover's three top-level tabs — Shipping label · Packing slip ·
 * Product paperwork — and each tab's one state for an order, derived from
 * its packet's slots (`OrderPacket`). Pure: the cards, the rail, the matrix
 * and the tab strip all read these.
 */

import { isPacketGap, type OrderPacket, type PacketSlotState } from '@/lib/label-prints/order-packet-contracts';
import type { PrintStock } from '@/lib/label-prints/print-route';

export const DOC_TABS = ['label', 'slip', 'paperwork'] as const;
export type DocTab = (typeof DOC_TABS)[number];

export const DOC_TAB_LABEL: Readonly<Record<DocTab, string>> = {
  label: 'Shipping label',
  slip: 'Packing slip',
  paperwork: 'Product paperwork',
};

/** What a tab's documents print on. */
export const DOC_TAB_STOCK: Readonly<Record<DocTab, PrintStock>> = { label: 'label', slip: 'paper', paperwork: 'paper' };

/** Worst first: a gap outranks a fill, a fill outranks an exemption. */
const RANK: Readonly<Record<PacketSlotState, number>> = { missing: 0, review: 1, filled: 2, not_required: 3 };

/** The tab's state for one order — paperwork is its worst line. */
export function docTabState(packet: OrderPacket, tab: DocTab): PacketSlotState {
  if (tab === 'label') return packet.label.state;
  if (tab === 'slip') return packet.slip.state;
  if (packet.lines.length === 0) return 'not_required';
  return packet.lines.reduce<PacketSlotState>((worst, line) => (RANK[line.state] < RANK[worst] ? line.state : worst), 'not_required');
}

/** Documents on file in the tab (labels + label documents, slips, every line's paperwork). */
export function docTabCount(packet: OrderPacket, tab: DocTab): number {
  if (tab === 'label') return packet.label.labels.length + packet.label.documents.length;
  if (tab === 'slip') return packet.slip.documents.length;
  return packet.lines.reduce((sum, line) => sum + line.documents.length, 0);
}

/** The first tab still owed, else the asked one. */
export function firstGapTab(packet: OrderPacket, fallback: DocTab): DocTab {
  return DOC_TABS.find((tab) => isPacketGap(docTabState(packet, tab))) ?? fallback;
}
