import { z } from 'zod';

const outboundDocumentType = z.enum(['shipping_label', 'packing_slip']);

/** POST /api/orders/[id]/documents — manual attach (upload fallback, D4). */
export const OutboundDocumentAttachBody = z
  .object({
    documentType: outboundDocumentType,
    url: z.string().trim().min(1, 'url is required'),
    platform: z.string().trim().nullable().optional(),
    source: z.string().trim().optional(),
    carrier: z.string().trim().nullable().optional(),
    tracking: z.string().trim().nullable().optional(),
    mimeType: z.string().trim().nullable().optional(),
    filename: z.string().trim().nullable().optional(),
  })
  .strict();

/** PATCH /api/documents/[id] — atomically point an existing outbound document at new bytes. */
export const OutboundDocumentReplaceBody = z
  .object({
    url: z.string().trim().min(1, 'url is required'),
    filename: z.string().trim().nullable().optional(),
    mimeType: z.string().trim().nullable().optional(),
  })
  .strict();

/** POST /api/orders/[id]/documents/fetch — marketplace fetch trigger (Phase 4 stub). */
export const OutboundDocumentFetchBody = z
  .object({
    types: z.array(outboundDocumentType).min(1, 'At least one document type is required'),
  })
  .strict();

/**
 * POST /api/orders/print-packet — browser-fallback paperwork for 1..100 orders
 * (`buildPaperworkPackets`). `batchId` is the client's idempotency key: a
 * retried request re-uses it, so the print-job ledger does not double-count.
 */
export const PaperworkPrintBody = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(100),
  batchId: z.string().trim().min(8).max(80),
});
