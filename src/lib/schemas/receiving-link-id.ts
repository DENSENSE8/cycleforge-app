import { z } from 'zod';

/**
 * POST /api/receiving/link-id — link ANY identifier to a carton.
 *
 * `identifier` is deliberately unconstrained beyond length: it is whatever is
 * printed on the box (Zoho PO#, marketplace order#, RMA, supplier reference).
 * Validating its SHAPE here would re-create the dead end this route exists to
 * remove — the server decides whether it resolves, never the regex.
 */
export const ReceivingLinkIdBody = z.object({
  receiving_id: z.number().int().positive(),
  /** The line that should carry the purchase identity. Omit for carton-only. */
  line_id: z.number().int().positive().nullish(),
  identifier: z.string().trim().min(1).max(128),
});

export type ReceivingLinkIdBody = z.infer<typeof ReceivingLinkIdBody>;
