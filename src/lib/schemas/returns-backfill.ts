import { z } from 'zod';

/** An ISO calendar date (`2025-04-01`) or an ISO instant with offset. */
const IsoInstant = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).transform((s) => new Date(s));

/** POST /api/returns/backfill — walk platform return history into the inbound import. */
export const ReturnsBackfillBody = z
  .object({
    /** Default: every returns provider. */
    providers: z.array(z.enum(['ebay', 'amazon'])).min(1).max(2).optional(),
    /** Oldest instant to walk to; default 18 months ago. */
    since: IsoInstant.optional(),
    /** Newest instant to walk from; default (and ceiling) now. */
    until: IsoInstant.optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .refine((b) => !b.since || !b.until || b.since < b.until, {
    message: 'since must be before until',
    path: ['since'],
  });
