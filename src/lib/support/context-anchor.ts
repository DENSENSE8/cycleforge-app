/**
 * Pure Support Context Hub anchor helpers — no DB / server-only imports.
 * Used by resolveSupportContext and unit-tested in isolation.
 */
import { pickTicketLinkAnchor } from '@/lib/support/tickets';
import type {
  SupportContextBundle,
  SupportContextLinkable,
} from '@/lib/support/context-types';

/** Thread preference: RECEIVING_LINE > RECEIVING > ORDER. */
export function pickSupportContextThreadEntity(args: {
  lineId?: number | null;
  receivingId?: number | null;
  orderRowId?: number | null;
}): { entityType: string; entityId: number } | null {
  if (args.lineId != null) {
    return { entityType: 'RECEIVING_LINE', entityId: args.lineId };
  }
  if (args.receivingId != null) {
    return { entityType: 'RECEIVING', entityId: args.receivingId };
  }
  if (args.orderRowId != null) {
    return { entityType: 'ORDER', entityId: args.orderRowId };
  }
  return null;
}

/**
 * Build the linkable CTA from resolved ids.
 * Mirrors ticket → SHIPMENT → receiving promotion via pickTicketLinkAnchor.
 */
export function buildSupportContextLinkable(args: {
  lineId?: number | null;
  receivingId?: number | null;
  shipmentId?: number | null;
  tracking?: string | null;
  orderRowId?: number | null;
}): SupportContextLinkable | null {
  const tracking = (args.tracking ?? '').trim() || null;
  const picked = pickTicketLinkAnchor({
    lineId: args.lineId ?? null,
    receivingId: args.receivingId ?? null,
    shipmentId: args.shipmentId ?? null,
  });
  if (picked) {
    if (picked.entityType === 'RECEIVING_LINE' || picked.entityType === 'RECEIVING') {
      return {
        canLinkTicket: true,
        anchorType: 'receiving',
        anchorId: picked.entityId,
        receivingId: args.receivingId ?? null,
        lineId: picked.entityType === 'RECEIVING_LINE' ? picked.entityId : args.lineId ?? null,
        trackingNumber: tracking,
      };
    }
    return {
      canLinkTicket: true,
      anchorType: 'shipment',
      anchorId: picked.entityId,
      trackingNumber: tracking,
      receivingId: args.receivingId ?? null,
      lineId: args.lineId ?? null,
    };
  }
  if (tracking) {
    return {
      canLinkTicket: true,
      anchorType: 'tracking',
      anchorId: 0,
      trackingNumber: tracking,
    };
  }
  if (args.orderRowId != null) {
    return {
      canLinkTicket: true,
      anchorType: 'order',
      anchorId: args.orderRowId,
    };
  }
  return null;
}

/** Prefer ticket → receiving → tracking → order for the hub header label. */
export function pickSupportContextAnchorMeta(args: {
  ticketScan?: string | null;
  ticketLabel?: string | null;
  receivingId?: number | null;
  tracking?: string | null;
  orderQ?: string | null;
  orderLabel?: string | null;
  orderRowId?: number | string | null;
}): SupportContextBundle['anchor'] {
  const ticketScan = (args.ticketScan ?? '').trim();
  if (ticketScan) {
    const id = ticketScan.replace(/^#/, '');
    return {
      type: 'ticket',
      id,
      label: args.ticketLabel ?? `#${id}`,
    };
  }
  if (args.receivingId != null) {
    return { type: 'receiving', id: args.receivingId, label: `Carton #${args.receivingId}` };
  }
  const tracking = (args.tracking ?? '').trim();
  if (tracking) {
    return { type: 'tracking', id: tracking, label: tracking };
  }
  if (args.orderQ || args.orderLabel || args.orderRowId != null) {
    return {
      type: 'order',
      id: args.orderRowId ?? args.orderQ ?? '',
      label: args.orderLabel ?? String(args.orderQ ?? args.orderRowId ?? ''),
    };
  }
  return { type: 'unknown', id: '', label: 'No match' };
}
