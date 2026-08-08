/**
 * Zod bodies for Incoming desk Add / CSV / identity PATCH.
 */

import { z } from 'zod';

const inboundSourceSchema = z.enum(['manual', 'ebay', 'amazon', 'zoho']);
const inboundKindSchema = z.enum(['purchase', 'return']);

export const InboundImportPurchaseBody = z.object({
  kind: inboundKindSchema.default('purchase'),
  source_type: inboundSourceSchema.default('manual'),
  /** Spine paint platform (amazon · ebay · goodwill · …). Optional. */
  source_platform: z.string().trim().max(40).optional().nullable(),
  /** Catalog receiving_type (PO · RETURN · TRADE_IN · …). */
  receiving_type: z.string().trim().max(40).optional().nullable(),
  /** Manual priority_tier 0..3; omit/null = Auto. */
  priority_tier: z.coerce.number().int().min(0).max(3).optional().nullable(),
  order_id: z.string().trim().min(1).max(200),
  line_item_id: z.string().trim().max(200).optional().nullable(),
  sku: z.string().trim().max(200).optional().nullable(),
  item_name: z.string().trim().max(500).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  tracking_number: z.string().trim().max(200).optional().nullable(),
  carrier_code: z.string().trim().max(40).optional().nullable(),
  seller: z.string().trim().max(200).optional().nullable(),
  listing_url: z.string().trim().max(2000).optional().nullable(),
  account_name: z.string().trim().max(200).optional().nullable(),
  return_reason: z.string().trim().max(500).optional().nullable(),
  rma_id: z.string().trim().max(200).optional().nullable(),
  condition_grade: z.string().trim().max(40).optional().nullable(),
}).refine((v) => Boolean(v.sku?.trim() || v.item_name?.trim()), {
  message: 'must provide at least one of: sku, item_name',
  path: ['sku'],
});

export type InboundImportPurchaseBody = z.infer<typeof InboundImportPurchaseBody>;

export const InboundImportCsvBody = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5_000),
});

export type InboundImportCsvBody = z.infer<typeof InboundImportCsvBody>;

export const InboundUpdateIdentityBody = z.object({
  receiving_line_id: z.coerce.number().int().positive(),
  tracking_number: z.string().trim().max(200).optional().nullable(),
  listing_url: z.string().trim().max(2000).optional().nullable(),
  order_number: z.string().trim().max(200).optional().nullable(),
});

export type InboundUpdateIdentityBody = z.infer<typeof InboundUpdateIdentityBody>;
