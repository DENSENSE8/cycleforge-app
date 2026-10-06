import { z } from 'zod';
import type { TicketLinkAnchorInput } from '@/lib/support/ticket-link';

// ─── /api/support/tickets/link ──────────────────────────────────────────────

const positiveId = z.number().int().positive();
const coercedPositiveId = z.coerce.number().int().positive();

const TicketLinkAnchorType = z.enum(['serialUnit', 'receiving', 'tracking', 'shipment', 'order', 'repair']);

/** The link anchor carried on `?anchorType=…&<id param>=…` (GET candidates, DELETE unlink). */
export function parseTicketLinkAnchorSearch(sp: URLSearchParams): TicketLinkAnchorInput {
  const anchorType = TicketLinkAnchorType.parse(sp.get('anchorType') ?? undefined);
  if (anchorType === 'serialUnit') {
    return { type: 'serialUnit', serialUnitId: coercedPositiveId.parse(sp.get('serialUnitId')) };
  }
  if (anchorType === 'receiving') {
    const receivingId = coercedPositiveId.parse(sp.get('receivingId'));
    const lineRaw = sp.get('lineId');
    const lineId = lineRaw != null && lineRaw !== ''
      ? z.coerce.number().int().parse(lineRaw)
      : undefined;
    return { type: 'receiving', receivingId, lineId };
  }
  if (anchorType === 'tracking') {
    const trackingNumber = z.string().trim().min(1).parse(sp.get('tracking') ?? sp.get('trackingNumber'));
    return { type: 'tracking', trackingNumber };
  }
  if (anchorType === 'shipment') {
    return { type: 'shipment', shipmentId: coercedPositiveId.parse(sp.get('shipmentId')) };
  }
  if (anchorType === 'repair') {
    return { type: 'repair', repairId: coercedPositiveId.parse(sp.get('repairId')) };
  }
  return { type: 'order', orderId: coercedPositiveId.parse(sp.get('orderId')) };
}

/** Add an EXTRA shipment to a ticket that keeps its existing anchor. */
export const TicketReferenceBody = z.object({
  ticketId: positiveId,
  reference: z.union([
    z.object({ shipmentId: positiveId }),
    z.object({ trackingNumber: z.string().trim().min(1) }),
  ]),
});

/** POST link — anchor an existing helpdesk ticket to one entity. */
export const TicketLinkBody = z.object({
  ticketId: positiveId,
  anchor: z.discriminatedUnion('type', [
    z.object({ type: z.literal('serialUnit'), serialUnitId: positiveId }),
    z.object({
      type: z.literal('receiving'),
      receivingId: positiveId,
      lineId: z.number().int().nullable().optional(),
    }),
    z.object({ type: z.literal('tracking'), trackingNumber: z.string().trim().min(1) }),
    z.object({ type: z.literal('shipment'), shipmentId: positiveId }),
    z.object({ type: z.literal('order'), orderId: positiveId }),
    z.object({ type: z.literal('repair'), repairId: positiveId }),
  ]),
});

// ─── POST /api/support/tickets ──────────────────────────────────────────────

const SupportTicketCreateAnchor = z.discriminatedUnion('type', [
  z.object({ type: z.literal('serialUnit'), serialUnitId: coercedPositiveId }),
  z.object({ type: z.literal('order'), orderId: coercedPositiveId }),
  z.object({ type: z.literal('shipment'), shipmentId: coercedPositiveId }),
  z.object({ type: z.literal('tracking'), trackingNumber: z.string().trim().min(1) }),
  z.object({
    type: z.literal('receiving'),
    receivingId: coercedPositiveId,
    lineId: z.coerce.number().int().nullable().optional(),
  }),
  z.object({ type: z.literal('repair'), repairId: coercedPositiveId }),
]);

const SupportTicketLinkagesBody = z
  .object({
    order: z.string().trim().min(1).max(128).optional(),
    tracking: z.string().trim().min(1).max(128).optional(),
    serial: z.string().trim().min(1).max(128).optional(),
  })
  .optional();

/** Station-generic ticket create. `test: true` validates and previews without creating anything (no helpdesk call, no writes, no inbox rings). */
export const SupportTicketCreateBody = z.object({
  subject: z.string().trim().min(1).max(300),
  note: z.string().trim().max(5000).optional(),
  anchor: SupportTicketCreateAnchor.optional(),
  linkages: SupportTicketLinkagesBody,
  test: z.boolean().optional(),
});
