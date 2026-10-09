/**
 * Which label an order buys next (operator 2026-10-08, the order record's
 * rule): no tracking and no label yet → its first label (`outbound`); shipped
 * on one → a replacement. The label slot and the docs sheet both ask. Pure.
 */

import type { LabelBuyPurpose } from '@/components/outbound/labels/replacement/ReplacementForm';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';

export function labelBuyPurpose(packet: Pick<OrderPacket, 'shipment' | 'label'>): LabelBuyPurpose {
  return packet.shipment != null || packet.label.labels.length + packet.label.documents.length > 0 ? 'replacement' : 'outbound';
}
