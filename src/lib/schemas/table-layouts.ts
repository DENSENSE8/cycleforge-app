/** Body schema for PUT /api/tables/layouts — the org-wide slot-layout write. */

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
