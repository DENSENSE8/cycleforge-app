/**
 * Body schema for PUT /api/tables/layouts — the org-wide slot-layout write.
 *
 * Structural only: the route re-validates the document against the table's
 * FIELD CATALOG via `parseSlotLayout` (unknown fields, forbidden bands,
 * duplicates), because that check needs the catalog and a per-table registry
 * (`SLOT_LAYOUT_TABLES`), not just a shape.
 */

import { z } from 'zod';
import { slotLayoutSchema } from '@/lib/tables/slot-layout';

export const OrgTableLayoutPutBody = z
  .object({
    tableId: z.string().min(1).max(64),
    /** The whole layout document, or null to reset to the product default. */
    layout: slotLayoutSchema.nullable(),
  })
  .strict();

export type OrgTableLayoutPutBody = z.infer<typeof OrgTableLayoutPutBody>;
