/**
 * Zod bodies for Incoming CSV import / identity PATCH. The single-order Add
 * body is `inboundOrderDraftSchema` (src/lib/inbound/inbound-order-draft.ts).
 */

import { z } from 'zod';

export const InboundImportCsvBody = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5_000),
});

export type InboundImportCsvBody = z.infer<typeof InboundImportCsvBody>;

export const InboundUpdateIdentityBody = z.object({
  receiving_line_id: z.coerce.number().int().positive(),
  tracking_number: z.string().trim().max(200).optional().nullable(),
  listing_url: z.string().trim().max(2000).optional().nullable(),
  order_number: z.string().trim().max(200).optional().nullable(),
  sku_catalog_id: z.coerce.number().int().positive().optional().nullable(),
});

export type InboundUpdateIdentityBody = z.infer<typeof InboundUpdateIdentityBody>;
