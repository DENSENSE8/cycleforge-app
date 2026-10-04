import { z } from 'zod';
import { TICKET_ITEM_MAX_QTY, TICKET_ITEM_ROLES } from '@/lib/support/product-token';
import { TICKET_ITEMS_MAX_PER_POST } from '@/lib/support/ticket-items';

/** POST /api/support/tickets/[ticketId]/items — the picks that rode one sent comment. */
export const SupportTicketItemsCreateBody = z.object({
  /** The helpdesk comment the picks rode on (from the reply response); null when unknown. */
  zendeskCommentId: z.number().int().positive().nullable().optional(),
  items: z
    .array(
      z.object({
        skuCatalogId: z.number().int().positive(),
        role: z.enum(TICKET_ITEM_ROLES),
        qty: z.number().int().min(1).max(TICKET_ITEM_MAX_QTY),
        note: z.string().max(500).nullable().optional(),
        clientEventId: z.string().trim().min(8).max(120),
      }),
    )
    .min(1)
    .max(TICKET_ITEMS_MAX_PER_POST),
});

/** GET /api/support/products — exactly one of q / ids / sku, else ticket suggestions. */
export const SupportProductsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  ids: z.array(z.number().int().positive()).max(50).optional(),
  sku: z.string().trim().min(1).max(200).optional(),
  ticketId: z.number().int().positive().optional(),
});
